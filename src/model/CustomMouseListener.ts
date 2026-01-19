import { MouseListener, SEdgeImpl, SGraphImpl, SModelElementImpl, SNodeImpl } from "sprotty";
import { Action } from "sprotty-protocol";
import { injectable } from "inversify";
import { displayContextMenu } from "../utils/displayContextMenu";
import { GraphModel } from "../model";
import { SprottyNode, SvgNode } from "../types";

@injectable()
export class CustomMouseListener extends MouseListener {
    private graphModel: GraphModel | null = null;
    private updateCallback: (() => void) | null = null;
    private highlightNodeCallback: ((nodeId: string) => void) | null = null;
    private highlightEdgeCallback: ((edgeId: string) => void) | null = null;

    private addNodeElement: HTMLElement | null = null;
    private deleteNodeElement: HTMLElement | null = null;
    private showJsonNodeElement: HTMLElement | null = null;
    private copyNodeElement: HTMLElement | null = null;
    private duplicateNodeElement: HTMLElement | null = null;
    private rotateLeftNodeElement: HTMLElement | null = null;
    private rotateRightNodeElement: HTMLElement | null = null;
    private flipHorizontalNodeElement: HTMLElement | null = null;
    private flipVerticalNodeElement: HTMLElement | null = null;

    private deleteEdgeElement: HTMLElement | null = null;
    private showJsonEdgeElement: HTMLElement | null = null;
    private copyEdgeElement: HTMLElement | null = null;
    private changeLineEdgeElement: HTMLElement | null = null;
    private changeDashEdgeElement: HTMLElement | null = null;

    private modalJsonContainer: HTMLElement | null = null;
    private modalJsonContent: HTMLElement | null = null;
    private modalJsonCloseButton: HTMLElement | null = null;
    private modalJsonBlur: HTMLElement | null = null;

    private boundAddNodeHandler: (() => void) | null = null;
    private boundDeleteNodeHandler: (() => void) | null = null;
    private boundShowJsonNodeHandler: (() => void) | null = null;
    private boundCopyNodeHandler: (() => void) | null = null;
    private boundDuplicateNodeHandler: (() => void) | null = null;
    private boundRotateLeftNodeHandler: (() => void) | null = null;
    private boundRotateRightNodeHandler: (() => void) | null = null;
    private boundFlipHorizontalNodeHandler: (() => void) | null = null;
    private boundFlipVerticalNodeHandler: (() => void) | null = null;

    private boundDeleteEdgeHandler: (() => void) | null = null;
    private boundShowJsonEdgeHandler: (() => void) | null = null;
    private boundCopyEdgeHandler: (() => void) | null = null;
    private boundChangeLineEdgeHandler: (() => void) | null = null;
    private boundChangeDashEdgeHandler: (() => void) | null = null;

    constructor() {
        super();
        this.initElements();

        this.modalJsonCloseButton?.addEventListener('click', () => {
            this.hideModal();
        });
        this.modalJsonBlur?.addEventListener('click', () => {
            this.hideModal();
        });

        // Add Esc key listener to hide modal
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                this.hideModal();
            }
        });
    }
    initElements(): void {
        const elements = {
            addNodeElement: 'context-add-node',
            deleteNodeElement: 'context-delete-node',
            copyNodeElement: 'context-copy-json-node',
            showJsonNodeElement: 'context-show-json-node',
            duplicateNodeElement: 'context-duplicate-node',
            rotateLeftNodeElement: 'context-rotate-left-node',
            rotateRightNodeElement: 'context-rotate-right-node',
            flipHorizontalNodeElement: 'context-flip-horizontal-node',
            flipVerticalNodeElement: 'context-flip-vertical-node',

            deleteEdgeElement: 'context-delete-edge',
            showJsonEdgeElement: 'context-show-json-edge',
            copyEdgeElement: 'context-copy-json-edge',
            changeLineEdgeElement: 'context-change-line-edge',
            changeDashEdgeElement: 'context-change-dash-edge',

            modalJsonContainer: 'modal-json-container',
            modalJsonContent: 'modal-json-content',
            modalJsonCloseButton: 'modal-json-close-btn',
            modalJsonBlur: 'modal-json-blur',
        }
        Object.entries(elements).forEach(([key, id]) => {
            this[key as keyof this] = document.getElementById(id) as any;
        })
    }

    setGraphModel(
        graphModel: GraphModel, 
        updateCallback: () => void, 
        highlightNodeCallback?: (nodeId: string) => void,
        highlightEdgeCallback?: (edgeId: string) => void
    ): void {
        this.graphModel = graphModel;
        this.updateCallback = updateCallback;
        this.highlightNodeCallback = highlightNodeCallback || null;
        this.highlightEdgeCallback = highlightEdgeCallback || null;
    }

    attachClickHandler(
        element: HTMLElement | null,
        boundHandler: (() => void) | null,
        newHandler: (e?: HTMLElementEventMap['click']) => void
    ): (() => void) | null {
        if (!element) return null;
        if(boundHandler) {
            element.removeEventListener('click', boundHandler);
        }
        element.addEventListener('click', newHandler);
        return newHandler;
    }

    hideContextMenu(): void {
        document.querySelectorAll('.context-menu').forEach(element => {
            (element as HTMLElement).style.display = 'none';
        });
    }

    mouseDown(target: SModelElementImpl, event: MouseEvent): (Action | Promise<Action>)[] {
        this.hideContextMenu();
        
        // Highlight node in editor when clicked (left click only, not right click)
        if (target instanceof SNodeImpl && event.button === 0 && this.highlightNodeCallback) {
            this.highlightNodeCallback(target.id);
        }
        
        // Highlight edge in editor when clicked (left click only, not right click)
        if (target instanceof SEdgeImpl && event.button === 0 && this.highlightEdgeCallback) {
            this.highlightEdgeCallback(target.id);
        }
        
        return super.mouseDown(target, event);
    }

    mouseUp(target: SModelElementImpl, event: MouseEvent): (Action | Promise<Action>)[] {
        // Update model after moving nodes or edges to sync positions to Monaco editor
        if ((target instanceof SNodeImpl || target instanceof SEdgeImpl) && this.updateCallback) {
            // Small delay to ensure DOM has updated
            setTimeout(() => {
                if (this.updateCallback) {
                    this.updateCallback();
                }
            }, 100);
        }
        
        return super.mouseUp(target, event);
    }

    contextMenu(target: any, event: MouseEvent): (Action | Promise<Action>)[] {
        // reset all context menu items to visible
        this.flipHorizontalNodeElement?.classList.remove('hidden');
        this.flipVerticalNodeElement?.classList.remove('hidden');

        if(target.flipHorizontal === null && target.type === 'node:svg') { 
            this.flipHorizontalNodeElement?.classList.add('hidden');
        }

        if(target.flipVertical === null && target.type === 'node:svg') {
            this.flipVerticalNodeElement?.classList.add('hidden');
        }
 
        // graph
        if (target instanceof SGraphImpl) {
            displayContextMenu(event, 'graph');

            this.boundAddNodeHandler = this.attachClickHandler(
                this.addNodeElement,
                this.boundAddNodeHandler,
                () => this.addNode()
            )
        }

        // node
        if (target instanceof SNodeImpl) {
            displayContextMenu(event, 'node');
           
            this.boundDeleteNodeHandler = this.attachClickHandler(
                this.deleteNodeElement,
                this.boundDeleteNodeHandler,
                () => this.deleteItem(target.id)
            );
            this.boundShowJsonNodeHandler = this.attachClickHandler(
                this.showJsonNodeElement,
                this.boundShowJsonNodeHandler,
                () => this.showJson(target)
            );
            this.boundCopyNodeHandler = this.attachClickHandler(
                this.copyNodeElement,
                this.boundCopyNodeHandler,
                () => this.copyJson(target)
            )
            this.boundDuplicateNodeHandler = this.attachClickHandler(
                this.duplicateNodeElement,
                this.boundDuplicateNodeHandler,
                () => this.duplicateItem(target.id)
            )
            this.boundRotateLeftNodeHandler = this.attachClickHandler(
                this.rotateLeftNodeElement,
                this.boundRotateLeftNodeHandler,
                () => this.rotateLeftNode(target)
            )
            this.boundRotateRightNodeHandler = this.attachClickHandler(
                this.rotateRightNodeElement,
                this.boundRotateRightNodeHandler,
                () => this.rotateRightNode(target)
            )
            this.boundFlipHorizontalNodeHandler = this.attachClickHandler(
                this.flipHorizontalNodeElement,
                this.boundFlipHorizontalNodeHandler,
                () => this.flipHorizontalNode(target)
            )
            this.boundFlipVerticalNodeHandler = this.attachClickHandler(
                this.flipVerticalNodeElement,
                this.boundFlipVerticalNodeHandler,
                () => this.flipVerticalNode(target)
            )
        }

        // edge
        if (target instanceof SEdgeImpl) {
            displayContextMenu(event, 'edge');

            this.boundDeleteEdgeHandler = this.attachClickHandler(
                this.deleteEdgeElement,
                this.boundDeleteEdgeHandler,
                () => this.deleteItem(target.id)
            )
            this.boundShowJsonEdgeHandler = this.attachClickHandler(
                this.showJsonEdgeElement,
                this.boundShowJsonEdgeHandler,
                () => this.showJson(target)
            )
            this.boundCopyEdgeHandler = this.attachClickHandler(
                this.copyEdgeElement,
                this.boundCopyEdgeHandler,
                () => this.copyJson(target)
            )
            this.boundChangeLineEdgeHandler = this.attachClickHandler(
                this.changeLineEdgeElement,
                this.boundChangeLineEdgeHandler,
                (e) => {
                    e?.stopPropagation();
                    const edgeSelected = document.getElementById('sprotty-container_' + target.id);
                    edgeSelected?.classList.remove('edge-dash');
                    this.hideContextMenu();
                }
            )
            this.boundChangeDashEdgeHandler = this.attachClickHandler(
                this.changeDashEdgeElement,
                this.boundChangeDashEdgeHandler,
                (e) => {
                    e?.stopPropagation();
                    const edgeSelected = document.getElementById('sprotty-container_' + target.id);
                    edgeSelected?.classList.add('edge-dash');
                    this.hideContextMenu();
                }
            )
        }
        return super.contextMenu(target, event);
    }

    addNode(): void {
        if (!this.graphModel || !this.updateCallback) {
            console.error('GraphModel or update callback not set');
            return;
        }
        const nodeId = `node-${Date.now()}`;
        const nodeName = 'Default Node';
        const randomX = Math.floor(Math.random() * 600) + 50;
        const randomY = Math.floor(Math.random() * 400) + 50; 
        const ports: Array<'in' | 'out'> = ['out', 'in']; // Default to single output port
        const newNode = this.graphModel.createNode({
            id: nodeId,
            x: randomX,
            y: randomY,
            name: nodeName,
            ports: ports,
        });

        const model = this.graphModel.getModel();
        model.children.push(newNode);

        this.updateCallback();
        this.hideContextMenu();
    }

    deleteItem(id: string): void {
        if (!this.graphModel || !this.updateCallback) {
            console.error('GraphModel or update callback not set');
            return;
        }
        const model = this.graphModel.getModel();
        const newChildren = [...model.children || []].filter((child) => {
            if((child.type === 'node:process' || child.type === 'node:svg' || child.type === 'edge:flow')) {
                return child.id !== id;
            } 
            return true;
        });
        model.children = newChildren;

        this.updateCallback();
        this.hideContextMenu();
    }

    showJson(node: SNodeImpl | SEdgeImpl): void {
        if (!this.graphModel || !this.updateCallback) {
            console.error('GraphModel or update callback not set');
            return;
        }
        const dataNode = this.graphModel.getModel().children.find((child: any) => child.id === node.id);
       
        if (this.modalJsonContainer && this.modalJsonContent) {
            this.modalJsonContent.textContent = JSON.stringify(dataNode, null, 2);
            this.modalJsonContainer.classList.remove('hidden');
        }
        this.hideContextMenu();
    }

    copyJson(node: SNodeImpl | SEdgeImpl): void {
        if (!this.graphModel || !this.updateCallback) {
            console.error('GraphModel or update callback not set');
            return;
        }
        const dataNode = this.graphModel.getModel().children.find((child: any) => child.id === node.id);
        const jsonString = JSON.stringify(dataNode, null, 2);

        navigator.clipboard.writeText(jsonString).then(() => {
            console.log('JSON copied to clipboard');
        }).catch(err => {
            console.error('Could not copy JSON: ', err);
        });

        this.hideContextMenu();
    }

    duplicateItem(id: string): void {
        if (!this.graphModel || !this.updateCallback) {
            console.error('GraphModel or update callback not set');
            return;
        }
        const model = this.graphModel.getModel();
        const originalNode = model.children?.find((child) => child.id === id);
        if (!originalNode) {
            console.error('Original node not found for duplication');
            return;
        }
        
        const newId = `node-${Date.now()}`;
        const duplicatedNode: SprottyNode = JSON.parse(JSON.stringify(originalNode));
        duplicatedNode.id = newId;
        if (duplicatedNode.position) {
            duplicatedNode.position.x += 20;
            duplicatedNode.position.y += 20;
        }
        duplicatedNode.children.forEach((child, index) => {
            if (child.portType === 'input' || child.portType === 'output') {
                const type = child.portType === 'input' ? 'in' : 'out';
                child.id = `${newId}-${type}${index+1}`;
            }
        })

        model.children.push(duplicatedNode);

        this.updateCallback();
        this.hideContextMenu();
    }

    async rotateLeftNode(node: SNodeImpl | SEdgeImpl) {
        if (!this.graphModel || !this.updateCallback) {
            console.error('GraphModel or update callback not set');
            return;
        }

        const model = this.graphModel.getModel();
        // Find the node in the model
        const modelNode = model.children.find((child: any) => child.id === node.id);

        // Rotate left by -90 degrees
        let currentRotation = (modelNode as any).rotation || 0;
        let newRotation = currentRotation - 90;
       
        if(currentRotation === -360) {
            newRotation = -90;
        }

        // Update rotation and recalculate port positions
        (modelNode as any).rotation = newRotation;
        this.updateNodePortPositions(modelNode as any);

        this.updateCallback();
        this.hideContextMenu();
    }
    
    async rotateRightNode(node: SNodeImpl | SEdgeImpl): Promise<void> {
        if (!this.graphModel || !this.updateCallback) {
            console.error('GraphModel or update callback not set');
            return;
        }

        const model = this.graphModel.getModel();
        // Find the node in the model
        const modelNode = model.children.find((child: any) => child.id === node.id);

        // Rotate right by +90 degrees
        const currentRotation = (modelNode as any).rotation || 0;
        let newRotation = currentRotation + 90;
        if(currentRotation === 360) {
            newRotation = 90;
        }
        
        // Update rotation and recalculate port positions
        (modelNode as any).rotation = newRotation;
        this.updateNodePortPositions(modelNode as any);
        
        this.updateCallback();
        this.hideContextMenu();
    }
    
    /**
     * Update port positions based on node rotation and flip
     */
    private updateNodePortPositions(node: any): void {
        if (!node.children) return;

        const isSvgNode = node.svgContent !== undefined;
        if (isSvgNode) {
            this.updateSvgNodePortPositions(node);
        } else {
            this.updateProcessNodePortPositions(node);
        }
    }

    private updateSvgNodePortPositions(node: SvgNode): void {
        if (!node.svgContent || !node.children) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(node.svgContent, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        
        if (!svg) return;

        const centerX = node.size.width / 2;
        const centerY = node.size.height / 2;
        const rotation = node.rotation || 0;
        const nodeFlipHorizontal = node.flipHorizontal || null;
        const nodeFlipVertical = node.flipVertical || null;

        // Find all elements with data-attribute="port"
        const portElements = svg.querySelectorAll('[data-attribute="port"]');
        
        portElements.forEach((element, index) => {
            // Extract port information using GraphModel helper
            const portInfo = GraphModel.extractPortInfo(element, node.id, index);
            
            // Find corresponding port in children
            const port = node.children.find((p: any) => p.id === portInfo.portId);
            if (!port) return;

            let x = portInfo.x;
            let y = portInfo.y;

            // Apply flip transformations before rotation
            if (node.enableFlipHorizontal) {
                x = node.size.width - x - portInfo.width + (nodeFlipHorizontal || 0);
            }
            if (node.enableFlipVertical) {
                y = node.size.height - y - portInfo.height + (nodeFlipVertical || 0);
            }

            // Calculate position with rotation using GraphModel helper
            const position = GraphModel.calculatePortPositionWithRotation(
                x,
                y,
                portInfo.width,
                portInfo.height,
                rotation,
                centerX,
                centerY
            );

            // Update port position
            port.position.x = position.x;
            port.position.y = position.y;
        });
    }

    private updateProcessNodePortPositions(node: any): void {
        if (!node.children) return;

        const centerX = node.size.width / 2;
        const centerY = node.size.height / 2;
        const rotation = node.rotation || 0;
        const nodeFlipHorizontal = node.flipHorizontal || null;
        const nodeFlipVertical = node.flipVertical || null;

        // For each port, store original position if not stored, then apply rotation
        node.children.forEach((port: any) => {
            // Store original position on first rotation
            if (!port.originalPosition) {
                port.originalPosition = {
                    x: port.position.x,
                    y: port.position.y
                };
            }

            // Use original position for calculation
            let x = port.originalPosition.x;
            let y = port.originalPosition.y;
            const portWidth = port.size?.width || 16;
            const portHeight = port.size?.height || 16;

            // Apply flip transformations before rotation
            if (node.enableFlipHorizontal) {
                x = node.size.width - x - portWidth + (nodeFlipHorizontal || 0);
            }
            if (node.enableFlipVertical) {
                y = node.size.height - y - portHeight + (nodeFlipVertical || 0);
            }

            // Calculate position with rotation using GraphModel helper
            const position = GraphModel.calculatePortPositionWithRotation(
                x,
                y,
                portWidth,
                portHeight,
                rotation,
                centerX,
                centerY
            );

            // Update port position
            port.position.x = position.x;
            port.position.y = position.y;
        });
    }

    private flipHorizontalNode(node: SNodeImpl): void {
        if (!this.graphModel || !this.updateCallback) {
            console.error('GraphModel or update callback not set');
            return;
        }

        const model = this.graphModel.getModel();
        const modelNode = model.children.find((child) => child.id === node.id) as any;

        // Toggle horizontal flip
        if(modelNode.flipHorizontal !== null && modelNode.type === 'node:svg') {
            modelNode.enableFlipHorizontal = !modelNode.enableFlipHorizontal;
        }

        if(modelNode.type === 'node:process') {
            modelNode.enableFlipHorizontal = !modelNode.enableFlipHorizontal;
        }

        // Update port positions based on flip
        this.updateNodePortPositions(modelNode as any);

        this.updateCallback();
        this.hideContextMenu();
    }

    private flipVerticalNode(node: SNodeImpl): void {
        if (!this.graphModel || !this.updateCallback) {
            console.error('GraphModel or update callback not set');
            return;
        }

        const model = this.graphModel.getModel();
        const modelNode = model.children.find((child: any) => child.id === node.id) as any;

        if (!modelNode) {
            console.warn('Node not found');
            return;
        }

        // Toggle vertical flip
        if(modelNode.flipVertical !== null && modelNode.type === 'node:svg') {
            modelNode.enableFlipVertical = !modelNode.enableFlipVertical;
        }

        if(modelNode.type === 'node:process') {
            modelNode.enableFlipVertical = !modelNode.enableFlipVertical;
        }
       
        // Update port positions based on flip
        this.updateNodePortPositions(modelNode as any);

        this.updateCallback();
        this.hideContextMenu();
    }
    
    hideModal(): void {
        if (this.modalJsonContainer) {
            this.modalJsonContainer.classList.add('hidden');
        }
    }
}