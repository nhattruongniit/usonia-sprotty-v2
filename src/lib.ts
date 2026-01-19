import sprottyCSS from 'sprotty/css/sprotty.css';
import customCSS from './styles/index.css';
import { Container, ContainerModule } from 'inversify';
import { 
    TYPES, 
    LocalModelSource, 
    SGraphView,
    SGraphImpl,
    SNodeImpl,
    SPortImpl,
    SEdgeImpl,
    configureModelElement,
    configureViewerOptions,
    loadDefaultModules,
    configureCommand
} from 'sprotty';
import { GraphModel } from './model';
import { EdgeCreator } from './edge-creator';
import { ProcessNodeView, FlowPortView, FlowEdgeView, SvgNodeView, PackageNodeView } from './views';
import { CustomMouseListener } from './model/CustomMouseListener';
import { ResizeCommand } from './model/ResizeCommand';
import { ICreateNodeWithPorts, SprottyNode } from './types';

function createSprottyContainer(containerId: string): Container {
    const sprottyModule = new ContainerModule((bind, unbind, isBound, rebind) => {
        bind(TYPES.ModelSource).to(LocalModelSource).inSingletonScope();
        const context = { bind, unbind, isBound, rebind };
        
        configureViewerOptions(context, {
            needsClientLayout: false,
            baseDiv: containerId
        });

        // configurate mouse event
        bind(CustomMouseListener).toSelf().inSingletonScope();
        bind(TYPES.MouseListener).toService(CustomMouseListener);
        
        // Configure model elements with custom views
        configureModelElement(context, 'graph', SGraphImpl, SGraphView);
        configureModelElement(context, 'node:process', SNodeImpl, ProcessNodeView);
        configureModelElement(context, 'port:flow', SPortImpl, FlowPortView);
        configureModelElement(context, 'edge:flow', SEdgeImpl, FlowEdgeView);
        configureModelElement(context, 'node:svg', SNodeImpl, SvgNodeView);
        configureModelElement(context, 'node:package', SNodeImpl, PackageNodeView);

        configureCommand(context, ResizeCommand);
    });

    const container = new Container();
    loadDefaultModules(container);
    container.load(sprottyModule);
    
    return container;
}

export interface SprottyOptions {
    containerId?: string;
    initialModel?: any;
}

export class Sprotty {
    private graphModel: GraphModel;
    private modelSource: LocalModelSource | null = null;
    private edgeCreator: EdgeCreator | null = null;
    private containerId: string;
    private container: Container | null = null;

    constructor(options: SprottyOptions = {}) {
        this.containerId = options.containerId || 'sprotty-container';
        this.graphModel = new GraphModel();
        if (options.initialModel) {
            this.graphModel.loadFromJson(options.initialModel);
        }
        this.injectStyles();
    }

    private injectStyles(): void {
        // Check if styles are already injected
        if (document.getElementById('sprotty-styles')) {
            return;
        }

        // Inject Sprotty CSS
        const sprottyStyle = document.createElement('style');
        sprottyStyle.id = 'sprotty-styles';
        sprottyStyle.textContent = sprottyCSS;
        document.head.appendChild(sprottyStyle);
        
        // Inject custom CSS
        const customStyle = document.createElement('style');
        customStyle.id = 'sprotty-custom-styles';
        customStyle.textContent = customCSS;
        document.head.appendChild(customStyle);
    }

    async init(): Promise<void> {
        try {
            // Check if container exists
            const containerElement = document.getElementById(this.containerId);
            if (!containerElement) {
                throw new Error(`Container element with id "${this.containerId}" not found`);
            }

            // Create Sprotty container
            this.container = createSprottyContainer(this.containerId);
            this.modelSource = this.container.get<LocalModelSource>(TYPES.ModelSource);

            // Get CustomMouseListener and set the graph model
            const mouseListener = this.container.get<CustomMouseListener>(CustomMouseListener);
            mouseListener.setGraphModel(
                this.graphModel, 
                () => this.updateModelInternal(),
                () => {}, // No Monaco editor in library mode
                () => {}  // No Monaco editor in library mode
            );

            // Set initial model
            await this.modelSource.updateModel(this.graphModel.getModel());

            // Setup edge creator after a short delay to ensure Sprotty has rendered
            setTimeout(() => {
                this.setupEdgeCreator();
            }, 300);
        } catch (error) {
            console.error('Sprotty initialization error:', error);
            throw error;
        }
    }

    private setupEdgeCreator(): void {
        const svgContainer = document.getElementById(this.containerId);
        if (!svgContainer) {
            console.error(`Sprotty container "${this.containerId}" not found`);
            return;
        }

        this.edgeCreator = new EdgeCreator(
            this.graphModel,
            svgContainer,
            () => this.updateModelInternal()
        );

        this.edgeCreator.setup();
    }

    private updateModelInternal(): void {
        if (this.modelSource) {
            // Sync current node positions from DOM before updating
            this.syncNodePositionsFromDOM();
            
            // Use updateModel instead of setModel to preserve positions
            this.modelSource.updateModel(this.graphModel.getModel());
        }
    }

    private syncNodePositionsFromDOM(): void {
        const nodeElements = document.querySelectorAll('.sprotty-node');
        
        nodeElements.forEach(nodeElement => {
            const id = nodeElement.getAttribute('id');
            if (!id) return;
            
            const match = id.match(/sprotty[^_]*_(.+)$/);
            if (!match) return;
            
            const nodeId = match[1];
            const transform = nodeElement.getAttribute('transform');
            
            if (transform) {
                const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
                if (translateMatch) {
                    const x = parseFloat(translateMatch[1]);
                    const y = parseFloat(translateMatch[2]);
                    this.graphModel.updateNodePosition(nodeId, x, y);
                }
            }
        });
    }

    /**
     * Get the current model
     */
    getModel(): any {
        return this.graphModel.getModel();
    }

    /**
     * Load a model from JSON
     */
    loadModel(model: any): void {
        this.graphModel.loadFromJson(model);
        if (this.modelSource) {
            this.modelSource.setModel(this.graphModel.getModel());
        }
    }

    /**
     * Update the model
     */
    updateModel(): void {
        this.updateModelInternal();
    }

    /**
     * Create a node with ports and add it to the diagram
     * @param config Configuration for the node with ports
     * @returns The created node
     */
    createNodeWithPorts(config: ICreateNodeWithPorts): void {
        const newNode = this.graphModel.addNodeWithPorts(config);
        this.updateModelInternal();
    }

    /**
     * Destroy the Sprotty instance
     */
    destroy(): void {
        if (this.edgeCreator) {
            // Clean up edge creator if it has a cleanup method
            // this.edgeCreator.cleanup();
        }
        if (this.container) {
            // Clean up container
            this.container.unbindAll();
        }
        this.modelSource = null;
        this.edgeCreator = null;
        this.container = null;
    }
}

// Export for browser globals (IIFE format)
// The build script will handle exposing this as window.Sprotty
export default Sprotty;

// Also expose directly to window for IIFE builds
if (typeof window !== 'undefined') {
    (window as any).Sprotty = Sprotty;
}
