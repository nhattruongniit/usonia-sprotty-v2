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
import { ISvgNodeLibarary, SvgNodeImpl } from './types';
import { svgContentToFile } from './utils/svgContentToFile';
import { modelicaNodeData } from './data';
import { ResizeCommand } from './model/ResizeCommand';

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
        configureModelElement(context, 'node:svg', SvgNodeImpl, SvgNodeView);
        configureModelElement(context, 'node:package', SNodeImpl, PackageNodeView);

        configureCommand(context, ResizeCommand);
    });

    const container = new Container();
    loadDefaultModules(container);
    container.load(sprottyModule);
    
    return container;
}

class SprottyApp {
    private graphModel: GraphModel;
    private modelSource: LocalModelSource | null = null;
    private edgeCreator: EdgeCreator | null = null;
    private draggedNodeData: any = null;
    private customSvgNodes: Array<any> = [];
    private svgNodeLibraryStorage = window.localStorage.getItem('customSvgNodeLibrary');
    private monacoEditor: any = null;
    private isUpdatingFromMonaco = false;
    private monacoUpdateTimer: any = null;

    constructor() {
        this.graphModel = new GraphModel();
        this.injectStyles();
    }

    private injectStyles(): void {
        // Inject Sprotty CSS
        const sprottyStyle = document.createElement('style');
        sprottyStyle.textContent = sprottyCSS;
        document.head.appendChild(sprottyStyle);
        
        // Inject custom CSS
        const customStyle = document.createElement('style');
        customStyle.textContent = customCSS;
        document.head.appendChild(customStyle);
    }

    async init(): Promise<void> {
        try {
            // Create Sprotty container
            const container = createSprottyContainer('sprotty-container');
            this.modelSource = container.get<LocalModelSource>(TYPES.ModelSource);

            // Get CustomMouseListener and set the graph model
            const mouseListener = container.get<CustomMouseListener>(CustomMouseListener);
            mouseListener.setGraphModel(
                this.graphModel, 
                () => this.updateModel(),
                (nodeId: string) => this.highlightNodeInEditor(nodeId),
                (edgeId: string) => this.highlightEdgeInEditor(edgeId)
            );


            // Set initial model
            await this.modelSource.updateModel(this.graphModel.getModel());

            // Setup edge creator after a short delay to ensure Sprotty has rendered
            setTimeout(() => {
                this.setupEdgeCreator();
            }, 300);

            this.initMonacoEditor();
            this.toggleShowMonaco();

            this._importSvgNodes();
            this.initialModelicaNodeLibrary();

            this.setupImportExportButtons();
            this.setupAddParentNodeButton();
            this.setupZoomControls();
            this.setupDragAndDrop();
            this.setupParseSvgModal();
            this.setupCreateSvgModal();
            this.setupResizeListener();
            this.setupAlignNode();

            // Load custom SVG nodes from localStorage
            if(this.svgNodeLibraryStorage) {
                this.customSvgNodes = JSON.parse(this.svgNodeLibraryStorage);
                this.customSvgNodes.forEach(nodeData => {
                    this.addSvgNodeToLibrary(nodeData);
                });
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    private setupResizeListener(): void {
        // Listen for resize actions
        const originalDispatch = this.modelSource!.actionDispatcher.dispatch.bind(this.modelSource!.actionDispatcher);
        this.modelSource!.actionDispatcher.dispatch = (action: any) => {
            const result = originalDispatch(action);
            
            // After resize action, sync the model
            if (action.kind === 'resize') {
                setTimeout(() => {
                    this.syncNodeSizeFromAction(action);
                }, 0);
            }
            
            return result;
        };
    }

    private syncNodeSizeFromAction(action: any): void {
        if (action.nodeId && action.newBounds) {
            // Update GraphModel with new size
            this.graphModel.updateNodeSize(
                action.nodeId,
                action.newBounds.width,
                action.newBounds.height
            );
            
            // Update Monaco Editor
            this.updateMonacoEditorContent();
        }
    }

    private setupEdgeCreator(): void {
        const svgContainer = document.getElementById('sprotty-container');
        if (!svgContainer) {
            console.error('Sprotty container not found');
            return;
        }

        this.edgeCreator = new EdgeCreator(
            this.graphModel,
            svgContainer,
            () => this.updateModel()
        );

        this.edgeCreator.setup();
    }

    private updateModel(): void {
        if (this.modelSource) {
            // Sync current node positions from DOM before updating
            this.syncNodePositionsFromDOM();
            
            // Use updateModel instead of setModel to preserve positions
            // This performs an incremental update without re-rendering everything
            this.modelSource.updateModel(this.graphModel.getModel());
            
            // Update Monaco Editor with current model
            this.updateMonacoEditorContent();
        }
    }

    /**
     * Sync node positions from the DOM back to the GraphModel
     * This ensures that when nodes are moved, their new positions are preserved
     * Also handles child nodes inside package nodes
     */
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
                    // This now handles both top-level nodes and child nodes in packages
                    this.graphModel.updateNodePosition(nodeId, x, y);
                }
            }
        });
    }

    setupImportExportButtons(): void {
        const importBtn = document.getElementById('import-json-btn');
        const exportBtn = document.getElementById('export-json-btn');
        
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e: Event) => {
                    const target = e.target as HTMLInputElement;
                    if (target.files && target.files.length > 0) {
                        const file = target.files[0];
                        const reader = new FileReader();
                        reader.onload = (event: ProgressEvent<FileReader>) => {
                            if (event.target && typeof event.target.result === 'string') {
                                try {
                                    const json = JSON.parse(event.target.result);
                                    this.graphModel.loadFromJson(json);
                                    this.modelSource && this.modelSource.setModel(json);
                                } catch (err) {
                                    console.error('❌ Error parsing JSON:', err);
                                }
                            }
                        };
                        reader.readAsText(file);
                    }
                };
                input.click();
            });
        }
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const model = this.graphModel.getModel();
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(model, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", "graph-model.json");
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            });
        }
    }

    setupAddParentNodeButton(): void {
        const addParentNodeBtn = document.getElementById('add-parent-node-btn');
        
        if (addParentNodeBtn) {
            addParentNodeBtn.addEventListener('click', () => {
                this.graphModel.addPackageNode();
                this.updateModel();
            });
        }
    }

    setupZoomControls(): void {
        const zoomInBtn = document.getElementById('zoom-in');
        const zoomOutBtn = document.getElementById('zoom-out');
        const zoomFitBtn = document.getElementById('zoom-fit');

        function setZoom(deltaY: number) {
            const graphEl = document.getElementById('sprotty-container_root');
            if (!graphEl) return;

            const evt = new WheelEvent('wheel', {
                deltaY,
                deltaMode: WheelEvent.DOM_DELTA_PIXEL,
                clientX: graphEl.clientWidth / 2,
                clientY: graphEl.clientHeight / 2,
            });
            graphEl.dispatchEvent(evt);
        }
        
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                setZoom(-80);
            });
        }
        
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                setZoom(80);
            });
        }
        
        if (zoomFitBtn) {
            zoomFitBtn.addEventListener('click', () => {
                if (this.modelSource) {
                const action = {
                    kind: 'fit',
                    elementIds: [],
                    padding: 20,
                    maxZoom: 1,
                    animate: true
                };
                this.modelSource.actionDispatcher.dispatch(action);
            }
            });
        }
    }

    _importSvgNodes(): void {
        const importSvgBtn = document.getElementById('import-svg-node-btn');
        if (importSvgBtn) {
            importSvgBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.svg';
                input.onchange = (e: Event) => {
                    const target = e.target as HTMLInputElement;
                    if (target.files && target.files.length > 0) {
                        const file = target.files[0];
                        const reader = new FileReader();
                        reader.onload = (event: ProgressEvent<FileReader>) => {
                            if (event.target && typeof event.target.result === 'string') {
                                const svgContent = event.target.result;
                                this.graphModel.importSvgNodes({
                                    svgContent,
                                    fileName: file.name
                                });
                                this.updateModel();
                            }
                        };
                        reader.readAsText(file);
                    }
                };
                input.click();
            });
        }
    }

    setupParseSvgModal() : void {
        const parseSvgBtnElement = document.getElementById('parse-svg-btn');
        const modalCloseBtnElement = document.getElementById('modal-parse-svg-close-btn');
        const modalParseSvgElement = document.getElementById('modal-parse-svg-container');
        const confirmParseSvgBtnElement = document.getElementById('btn-confirm-parse-svg-content');
        const svgContentTextAreaElement = document.getElementById('svg-content-textarea') as HTMLTextAreaElement;
        const svgResultTextAreaElement = document.getElementById('svg-result-textarea') as HTMLTextAreaElement;
        const parseSvgDownloadBtnElement = document.getElementById('parse-svg-download-btn');
        const parseSvgCopyBtnElement = document.getElementById('parse-svg-copy-btn');
        const parseSvgShowResultElement = document.getElementById('parse-svg-show-result');
        const parseSvgClearElement = document.getElementById('parse-svg-clear-btn');

        function clearSvgParseModal() {
            svgContentTextAreaElement.value = '';
            svgResultTextAreaElement.value = '';
              if (parseSvgShowResultElement) {
                parseSvgShowResultElement.classList.add('hidden');
                parseSvgShowResultElement.innerHTML = '';
            }
        }

        // confirm parse SVG content
        confirmParseSvgBtnElement?.addEventListener('click', () => {
            const svgContent = svgContentTextAreaElement.value;
            const convertedSvgCode = svgContentToFile(svgContent);
            svgResultTextAreaElement.value = convertedSvgCode;

            // show svg file preview
            if (parseSvgShowResultElement) {
                parseSvgShowResultElement.classList.remove('hidden');
                parseSvgShowResultElement.innerHTML = convertedSvgCode;
            }
        });

        parseSvgBtnElement?.addEventListener('click', () => {
            modalParseSvgElement?.classList.remove('hidden')
        });

        modalCloseBtnElement?.addEventListener('click', () => {
            modalParseSvgElement?.classList.add('hidden');
            clearSvgParseModal
        });

        parseSvgClearElement?.addEventListener('click', () => {
            clearSvgParseModal();
        });

        // copy SVG code to clipboard
        parseSvgCopyBtnElement?.addEventListener('click', () => {
            if (svgResultTextAreaElement && svgResultTextAreaElement.value.trim()) {
                navigator.clipboard.writeText(svgResultTextAreaElement.value);
            } else {
                alert('No SVG content to copy. Please convert SVG content first.');
            }
        });

        // Download SVG code as file
        parseSvgDownloadBtnElement?.addEventListener('click', () => {
            if (svgResultTextAreaElement && svgResultTextAreaElement.value.trim()) {
                const svgCode = svgResultTextAreaElement.value;
                const fileName = `converted-svg-${Date.now()}.svg`;

                // Create blob with SVG content
                const blob = new Blob([svgCode], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);

                // Create download link and trigger download
                const downloadLink = document.createElement('a');
                downloadLink.href = url;
                downloadLink.download = fileName;
                downloadLink.style.display = 'none';

                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);

                // Clean up URL
                URL.revokeObjectURL(url);
            } else {
                alert('No SVG content to download. Please convert SVG content first.');
            }
        });
    }

    private createLibraryNodeElement({
        nodeData,
        showDeleteButton = false,
        onDelete,
        titleClassName = ''
    }: {
        nodeData: any;
        showDeleteButton?: boolean;
        onDelete?: () => void;
        titleClassName?: string;
    }): HTMLDivElement {
        const divContainer = document.createElement('div');
        divContainer.className = 'flex items-center text-[12px] ml-5 my-2';

        const divNode = document.createElement('div');
        divNode.className = 'border border-gray-300 mr-1 p-1 cursor-pointer hover:bg-gray-200 h-[35px] w-[35px] flex justify-center items-center';
        divNode.title = nodeData.title || 'Node';
        divNode.setAttribute('data-attribute-id', 'modelica-node');
        divNode.setAttribute('draggable', 'true');

        const divTitle = document.createElement('div');
        divTitle.innerText = nodeData.title;
        if (titleClassName) {
            divTitle.className = titleClassName;
        }

        // Render SVG content or image
        if (nodeData.svgContent) {
            const svgWrapper = document.createElement('div');
            svgWrapper.className = 'w-full h-full flex justify-center items-center';
            svgWrapper.innerHTML = nodeData.svgContent;
            
            const svgElement = svgWrapper.querySelector('svg');
            if (svgElement) {
                svgElement.style.width = '100%';
                svgElement.style.height = '100%';
                svgElement.setAttribute('draggable', 'false');
            }
            
            divNode.appendChild(svgWrapper);
        } else {
            const imgElement = document.createElement('img');
            imgElement.src = nodeData.imgPath || '';
            imgElement.alt = nodeData.title;
            imgElement.className = 'w-full h-full object-contain';
            imgElement.setAttribute('draggable', 'false');
            divNode.appendChild(imgElement);
        }

        divContainer.appendChild(divNode);
        divContainer.appendChild(divTitle);

        // Add delete button if needed
        if (showDeleteButton && onDelete) {
            const divDeleteBtn = document.createElement('div');
            divDeleteBtn.className = 'ml-2 text-red-500 cursor-pointer hover:text-red-700';
            divDeleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            divDeleteBtn.title = 'Delete SVG Node';
            divDeleteBtn.addEventListener('click', onDelete);
            divContainer.appendChild(divDeleteBtn);
        }

        // Setup drag events
        divNode.addEventListener('dragstart', (e: DragEvent) => {
            this.draggedNodeData = { ...nodeData };
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', nodeData.title);
            }
            divNode.style.opacity = '0.5';
        });

        divNode.addEventListener('dragend', () => {
            divNode.style.opacity = '1';
            this.draggedNodeData = null;
        });

        return divContainer;
    }

    initialModelicaNodeLibrary(): void {
        const modelicaNodeLibraryElement = document.getElementById('modelica-node-library');
        modelicaNodeData.forEach(nodeData => {
            const divContainer = this.createLibraryNodeElement({
                nodeData,
                showDeleteButton: false
            });
            modelicaNodeLibraryElement?.appendChild(divContainer);
        });
    }

    private setupDragAndDrop(): void {
        const sprottyContainer = document.getElementById('sprotty-container');
        if (!sprottyContainer) {
            console.error('Sprotty container not found');
            return;
        }

        // Prevent default drag behavior
        sprottyContainer.addEventListener('dragover', (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        sprottyContainer.addEventListener('dragenter', (e: DragEvent) => {
            e.preventDefault();
        });

        // Handle drop event
        sprottyContainer.addEventListener('drop', (e: DragEvent) => {
            e.preventDefault();
            
            if (!this.draggedNodeData) {
                return;
            }

            // Get drop position relative to the sprotty SVG
            const svgElement = sprottyContainer.querySelector('svg');
            if (!svgElement) {
                console.error('SVG element not found');
                return;
            }

            const rect = svgElement.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Load SVG content and add node
            this.loadSvgAndAddNode({
                svgPath: this.draggedNodeData.imgPath,
                title: this.draggedNodeData.title,
                x,
                y,
                flipHorizontal: this.draggedNodeData.flipHorizontal,
                flipVertical: this.draggedNodeData.flipVertical
            });
            
            this.draggedNodeData = null;
        });
    }

    private async loadSvgAndAddNode({
        svgPath, 
        title, 
        x, 
        y,
        flipHorizontal = null,
        flipVertical = null
    }: { svgPath: string; title: string; x: number; y: number; flipHorizontal?: number | null; flipVertical?: number | null }): Promise<void> {
        try {
            const response = await fetch(svgPath);
            if (!response.ok) {
                throw new Error(`Failed to load SVG: ${response.statusText}`);
            }
            const svgContent = await response.text();
            
            // Add node to graph model at the drop position
            this.graphModel.importSvgNodes({
                svgContent, 
                fileName: title, 
                x, 
                y,
                flipHorizontal,
                flipVertical
            });
            this.updateModel();
        } catch (error) {
            console.error('Error loading SVG:', error);
        }
    }

    setupCreateSvgModal() : void {
        const createSvgBtnElement = document.getElementById('create-svg-node-btn');
        const modalCloseBtnElement = document.getElementById('modal-create-svg-close-btn');
        const modalCreateSvgElement = document.getElementById('modal-create-svg-container');
        const confirmCreateSvgBtnElement = document.getElementById('btn-confirm-create-svg');
        const svgNameInputElement = document.getElementById('create-svg-name-input') as HTMLInputElement;
        const svgFileTextArea = document.getElementById('svg-file-textarea') as HTMLTextAreaElement;
        const svgStringifyTextArea = document.getElementById('svg-stringify-textarea') as HTMLTextAreaElement;
        const modalCreateSvgNodeBtn = document.getElementById('modal-create-svg-node-btn');
        const modalClearSvgNodeBtn = document.getElementById('modal-clear-svg-node-btn');
        const modalCopySvgNodeBtn = document.getElementById('modal-copy-svg-node-btn');
        
        createSvgBtnElement?.addEventListener('click', () => {
            modalCreateSvgElement?.classList.remove('hidden')
        });

        modalClearSvgNodeBtn?.addEventListener('click', () => {
            this.clearCreateSvgModal(svgNameInputElement, svgFileTextArea, svgStringifyTextArea);
        });

        modalCopySvgNodeBtn?.addEventListener('click', () => {
            if (svgStringifyTextArea && svgStringifyTextArea.value.trim()) {
                navigator.clipboard.writeText(svgStringifyTextArea.value);
            } else {
                alert('No SVG content to copy. Please create SVG node first.');
            }
        });

        modalCloseBtnElement?.addEventListener('click', () => {
            modalCreateSvgElement?.classList.add('hidden');
            this.clearCreateSvgModal(svgNameInputElement, svgFileTextArea, svgStringifyTextArea);
        });

        confirmCreateSvgBtnElement?.addEventListener('click', () => {
            const svgContent = svgFileTextArea.value.trim();
            if (!svgContent) {
                alert('Please enter SVG file.');
                return;
            }
            svgStringifyTextArea.value = svgFileTextArea.value.trim();
        });

        modalCreateSvgNodeBtn?.addEventListener('click', () => {
            const inputName = svgNameInputElement.value.trim();
            const nodeName = inputName || `SVG Node ${Date.now()}`;

            if(!inputName) {
                alert('Please enter a name for the SVG node.');
                return;
            }
            const svgContent = svgFileTextArea.value.trim();

            this.createSvgNodeLibrary({
                svgContent,
                nodeName
            });
            modalCreateSvgElement?.classList.add('hidden');
            this.clearCreateSvgModal(svgNameInputElement, svgFileTextArea, svgStringifyTextArea);       
        });
    }

    private createSvgNodeLibrary({ svgContent, nodeName  }: { svgContent: string, nodeName: string }): void {
        if (!svgContent) {
            return;
        }
        const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
        const newNodeData = {
            id: window.crypto.randomUUID(),
            title: nodeName,
            imgPath: svgDataUrl,
            svgContent
        };
        this.customSvgNodes.push(newNodeData);
        window.localStorage.setItem('customSvgNodeLibrary', JSON.stringify(this.customSvgNodes));
        this.addSvgNodeToLibrary(newNodeData);
    }

    private clearCreateSvgModal(
        nameInput: HTMLInputElement, 
        fileTextArea: HTMLTextAreaElement,
        stringifyTextArea: HTMLTextAreaElement
    ): void {
        nameInput.value = '';
        fileTextArea.value = '';
        stringifyTextArea.value = '';
    }

    private addSvgNodeToLibrary(nodeData: ISvgNodeLibarary): void {
        const svgNodeLibraryElement = document.getElementById('svg-node-library');
        if (!svgNodeLibraryElement) return;

        const divContainer = this.createLibraryNodeElement({
            nodeData,
            showDeleteButton: true,
            titleClassName: 'w-[130px] truncate',
            onDelete: () => {
                svgNodeLibraryElement.removeChild(divContainer);
                this.customSvgNodes = this.customSvgNodes.filter(node => node.id !== nodeData.id);
                window.localStorage.setItem('customSvgNodeLibrary', JSON.stringify(this.customSvgNodes));
            }
        });

        svgNodeLibraryElement.appendChild(divContainer);
    }

    private initMonacoEditor(): void {
        // Wait for Monaco Editor to load from CDN
        const loadMonaco = () => {
            if (typeof (window as any).require === 'undefined') {
                console.error('Monaco Editor loader not found');
                return;
            }

            (window as any).require.config({ 
                paths: { 
                    'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' 
                } 
            });

            (window as any).require(['vs/editor/editor.main'], () => {
                const editorElement = document.getElementById('editor-json');
                if (!editorElement) {
                    console.error('Editor container not found');
                    return;
                }

                this.monacoEditor = (window as any).monaco.editor.create(editorElement, {
                    value: JSON.stringify(this.graphModel.getModel(), null, 2),
                    language: 'json',
                    automaticLayout: true,
                    readOnly: false,
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    fontSize: 11,
                });

                // Listen to content changes and update diagram
                this.monacoEditor.onDidChangeModelContent(() => {
                    this.onMonacoContentChanged();
                });

                console.log('Monaco Editor initialized');
            });
        };

        // Load Monaco Editor after a short delay to ensure DOM is ready
        setTimeout(loadMonaco, 100);
    }

    private updateMonacoEditorContent(): void {
        if (this.monacoEditor && !this.isUpdatingFromMonaco) {
            const currentModel = this.graphModel.getModel();
            const jsonString = JSON.stringify(currentModel, null, 2);
            
            // Only update if content has changed to avoid cursor jump
            if (this.monacoEditor.getValue() !== jsonString) {
                const position = this.monacoEditor.getPosition();
                this.monacoEditor.setValue(jsonString);
                if (position) {
                    this.monacoEditor.setPosition(position);
                }
            }
        }
    }
    private onMonacoContentChanged(): void {
        // Clear existing timer
        if (this.monacoUpdateTimer) {
            clearTimeout(this.monacoUpdateTimer);
        }

        // Debounce updates to avoid too frequent updates while typing
        this.monacoUpdateTimer = setTimeout(() => {
            this.updateDiagramFromMonaco();
        }, 100);
    }

    private updateDiagramFromMonaco(): void {
        if (!this.monacoEditor || !this.modelSource) return;

        try {
            const jsonString = this.monacoEditor.getValue();
            const newModel = JSON.parse(jsonString);

            // Validate that it's a valid graph model
            if (!newModel || typeof newModel !== 'object' || !newModel.type || !newModel.id) {
                console.warn('Invalid graph model in Monaco editor');
                return;
            }

            // Set flag to prevent infinite loop
            this.isUpdatingFromMonaco = true;

            // Load the new model into graph model
            this.graphModel.loadFromJson(newModel);
            
            // Use updateModel instead of setModel to preserve viewport (zoom/pan)
            // updateModel performs an incremental update without resetting the viewport
            this.modelSource.updateModel(newModel);

            // Reset flag after a short delay
            setTimeout(() => {
                this.isUpdatingFromMonaco = false;
            }, 100);

        } catch (error) {
            // Silently ignore JSON parse errors while user is typing
            console.debug('JSON parse error (this is normal while editing):', error);
        }
    }
    private highlightNodeInEditor(nodeId: string): void {
        if (!this.monacoEditor) {
            console.warn('Monaco editor not initialized');
            return;
        }

        const editorContent = this.monacoEditor.getValue();
        
        // Find the node object in the JSON string
        // Pattern to find the node with this ID in the children array
        const nodePattern = new RegExp(
            `("id"\\s*:\\s*"${nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")`,
            'g'
        );
        
        const match = nodePattern.exec(editorContent);
        if (!match) {
            console.warn(`Node ${nodeId} not found in editor content`);
            return;
        }

        // Find the start of the node object (find the { before the id)
        let startPos = match.index;
        let braceCount = 0;
        let objectStart = startPos;
        
        // Search backwards to find the opening brace of this node object
        for (let i = startPos - 1; i >= 0; i--) {
            if (editorContent[i] === '}') {
                braceCount++;
            } else if (editorContent[i] === '{') {
                if (braceCount === 0) {
                    objectStart = i;
                    break;
                }
                braceCount--;
            }
        }

        // Find the end of the node object
        braceCount = 0;
        let objectEnd = startPos;
        let foundOpenBrace = false;
        
        for (let i = objectStart; i < editorContent.length; i++) {
            if (editorContent[i] === '{') {
                braceCount++;
                foundOpenBrace = true;
            } else if (editorContent[i] === '}') {
                braceCount--;
                if (foundOpenBrace && braceCount === 0) {
                    objectEnd = i + 1;
                    break;
                }
            }
        }

        // Convert position to line and column
        const model = this.monacoEditor.getModel();
        if (!model) return;

        const startPosition = model.getPositionAt(objectStart);
        const endPosition = model.getPositionAt(objectEnd);

        // Set selection and reveal the range
        const range = new (window as any).monaco.Range(
            startPosition.lineNumber,
            startPosition.column,
            endPosition.lineNumber,
            endPosition.column
        );

        this.monacoEditor.setSelection(range);
        this.monacoEditor.revealRangeInCenter(range);
        
        // Optional: Add temporary highlight decoration
        const decorations = this.monacoEditor.deltaDecorations([], [
            {
                range: range,
                options: {
                    isWholeLine: false,
                    className: 'highlight-node-json',
                    inlineClassName: 'highlight-node-json-inline'
                }
            }
        ]);

        // Remove decoration after 2 seconds
        setTimeout(() => {
            this.monacoEditor?.deltaDecorations(decorations, []);
        }, 2000);
    }

    private highlightEdgeInEditor(edgeId: string): void {
        if (!this.monacoEditor) {
            console.warn('Monaco editor not initialized');
            return;
        }

        const editorContent = this.monacoEditor.getValue();
        
        // Find the edge object in the JSON string
        // Pattern to find the edge with this ID in the edges array
        const edgePattern = new RegExp(
            `("id"\\s*:\\s*"${edgeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")`,
            'g'
        );
        
        const match = edgePattern.exec(editorContent);
        if (!match) {
            console.warn(`Edge ${edgeId} not found in editor content`);
            return;
        }

        // Find the start of the edge object (find the { before the id)
        let startPos = match.index;
        let braceCount = 0;
        let objectStart = startPos;
        
        // Search backwards to find the opening brace of this edge object
        for (let i = startPos - 1; i >= 0; i--) {
            if (editorContent[i] === '}') {
                braceCount++;
            } else if (editorContent[i] === '{') {
                if (braceCount === 0) {
                    objectStart = i;
                    break;
                }
                braceCount--;
            }
        }

        // Find the end of the edge object
        braceCount = 0;
        let objectEnd = startPos;
        let foundOpenBrace = false;
        
        for (let i = objectStart; i < editorContent.length; i++) {
            if (editorContent[i] === '{') {
                braceCount++;
                foundOpenBrace = true;
            } else if (editorContent[i] === '}') {
                braceCount--;
                if (foundOpenBrace && braceCount === 0) {
                    objectEnd = i + 1;
                    break;
                }
            }
        }

        // Convert position to line and column
        const model = this.monacoEditor.getModel();
        if (!model) return;

        const startPosition = model.getPositionAt(objectStart);
        const endPosition = model.getPositionAt(objectEnd);

        // Set selection and reveal the range
        const range = new (window as any).monaco.Range(
            startPosition.lineNumber,
            startPosition.column,
            endPosition.lineNumber,
            endPosition.column
        );

        this.monacoEditor.setSelection(range);
        this.monacoEditor.revealRangeInCenter(range);
        
        // Optional: Add temporary highlight decoration
        const decorations = this.monacoEditor.deltaDecorations([], [
            {
                range: range,
                options: {
                    isWholeLine: false,
                    className: 'highlight-edge-json',
                    inlineClassName: 'highlight-edge-json-inline'
                }
            }
        ]);

        // Remove decoration after 2 seconds
        setTimeout(() => {
            this.monacoEditor?.deltaDecorations(decorations, []);
        }, 2000);
    }

    private toggleShowMonaco(): void {
        const COLLAPSED_WIDTH = '38px';
        const EXPANDED_WIDTH = '700px';
        const editorJson = document.getElementById('editor-json');
        const btnToggleCollapseMonaco = document.getElementById('btn-toggle-collapse-monaco');
        
        if (!editorJson || !btnToggleCollapseMonaco) {
            console.warn('Monaco toggle elements not found');
            return;
        }

        let isCollapsed = false;

        btnToggleCollapseMonaco.addEventListener('click', () => {
            if (isCollapsed) {
                // Expand
                editorJson.style.width = EXPANDED_WIDTH;
                btnToggleCollapseMonaco.innerHTML = '<i class="fa-solid fa-chevron-right text-white"></i>';
                isCollapsed = false;
            } else {
                // Collapse
                editorJson.style.width = COLLAPSED_WIDTH;
                btnToggleCollapseMonaco.innerHTML = '<i class="fa-solid fa-chevron-left text-white"></i>';
                isCollapsed = true;
            }
        });
    }

    setupAlignNode(): void {
        const alignLeftBtn = document.getElementById('align-left');
        const alignCenterVerticalBtn = document.getElementById('align-center-vertical');
        const alignRightBtn = document.getElementById('align-right');
        const alignTopBtn = document.getElementById('align-top');
        
        alignLeftBtn?.addEventListener('click', () => {
            if (!this.modelSource) return;
            
            const selectedNodes = this.getSelectedNodes();
            if (selectedNodes.length === 0) {
                console.log('No nodes selected');
                return;
            }

            let minX = Infinity;
            selectedNodes.forEach((node: any) => {
                if (node.position && typeof node.position.x === 'number') {
                    minX = Math.min(minX, node.position.x);
                }
            });
            selectedNodes.forEach((node: any) => {
                if (node.position && typeof node.position.x === 'number') {
                    this.graphModel.updateNodePosition(node.id, minX, node.position.y);
                }
            });
            
            if (this.modelSource) {
                this.modelSource.setModel(this.graphModel.getModel());
                this.updateMonacoEditorContent();
            }
        });

        alignCenterVerticalBtn?.addEventListener('click', () => {
            if (!this.modelSource) return;
            
            const selectedNodes = this.getSelectedNodes();
            if (selectedNodes.length === 0) {
                console.log('No nodes selected');
                return;
            }

            let sumX = 0;
            selectedNodes.forEach((node: any) => {
                if (node.position && typeof node.position.x === 'number') {
                    sumX += node.position.x;
                }
            });
            const centerX = sumX / selectedNodes.length;

            selectedNodes.forEach((node: any) => {
                if (node.position && typeof node.position.x === 'number') {
                    this.graphModel.updateNodePosition(node.id, centerX, node.position.y);
                }
            });
            
            if (this.modelSource) {
                this.modelSource.setModel(this.graphModel.getModel());
                this.updateMonacoEditorContent();
            }
        });

        alignRightBtn?.addEventListener('click', () => {
            if (!this.modelSource) return;
            
            const selectedNodes = this.getSelectedNodes();
            if (selectedNodes.length === 0) {
                console.log('No nodes selected');
                return;
            }

            let maxX = -Infinity;
            selectedNodes.forEach((node: any) => {
                if (node.position && typeof node.position.x === 'number') {
                    maxX = Math.max(maxX, node.position.x);
                }
            });
            selectedNodes.forEach((node: any) => {
                if (node.position && typeof node.position.x === 'number') {
                    this.graphModel.updateNodePosition(node.id, maxX, node.position.y);
                }
            });
            
            if (this.modelSource) {
                this.modelSource.setModel(this.graphModel.getModel());
                this.updateMonacoEditorContent();
            }
        });

        alignTopBtn?.addEventListener('click', () => {
            if (!this.modelSource) return;
            
            const selectedNodes = this.getSelectedNodes();
            if (selectedNodes.length === 0) {
                console.log('No nodes selected');
                return;
            }

            let minY = Infinity;
            selectedNodes.forEach((node: any) => {
                if (node.position && typeof node.position.y === 'number') {
                    minY = Math.min(minY, node.position.y);
                }
            });
            selectedNodes.forEach((node: any) => {
                if (node.position && typeof node.position.y === 'number') {
                    this.graphModel.updateNodePosition(node.id, node.position.x, minY);
                }
            });
            
            if (this.modelSource) {
                this.modelSource.setModel(this.graphModel.getModel());
                this.updateMonacoEditorContent();
            }
        });
    }

    getSelectedNodes() {
        const sprottyContainer = document.getElementById('sprotty-container');
        if (!sprottyContainer) return [];

        const selectedElements = sprottyContainer.querySelectorAll('.selected');
        const selectedNodeIds: string[] = [];
        selectedElements?.forEach(element => {
            const id = element.id.replace('sprotty-container_', '');
            if (element.classList.contains('sprotty-node')) {
                selectedNodeIds.push(id);
            }
        });
        
        const selectedNodes = this.graphModel.getModel().children.filter(child => 
            selectedNodeIds.includes(child.id)
        );

        return selectedNodes;
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const app = new SprottyApp();
        app.init();
    });
} else {
    const app = new SprottyApp();
    app.init();
}
