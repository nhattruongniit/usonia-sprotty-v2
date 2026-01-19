import { GraphModel } from './model';
import { findPortInfo, getPortPosition, getSvgMousePosition, getViewTransform, debugCoordinates } from './port-utils';
import { Position } from './types';

interface EdgeCreationState {
    isCreating: boolean;
    sourcePortId: string | null;
    sourcePosition: Position | null;
}

export class EdgeCreator {
    private graphModel: GraphModel;
    private svgContainer: HTMLElement;
    private state: EdgeCreationState;
    private feedbackLine: SVGPathElement | null = null;
    private onModelUpdate: () => void;

    constructor(
        graphModel: GraphModel,
        svgContainer: HTMLElement,
        onModelUpdate: () => void
    ) {
        this.graphModel = graphModel;
        this.svgContainer = svgContainer;
        this.onModelUpdate = onModelUpdate;
        this.state = {
            isCreating: false,
            sourcePortId: null,
            sourcePosition: null
        };
    }

    setup(): void {
        this.svgContainer.addEventListener('mousedown', this.handleMouseDown.bind(this), true);
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // Add debug keyboard shortcut: Press 'D' to dump coordinates
        document.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                debugCoordinates();
            }
        });
    }

    private handleMouseDown(e: MouseEvent): void {
        const portInfo = findPortInfo(e.target as Element);
        
        if (portInfo && portInfo.type === 'output') {
            // Log view transform at start of edge creation
            const viewTransform = getViewTransform();
            
            this.state.isCreating = true;
            this.state.sourcePortId = portInfo.id;
            this.state.sourcePosition = getPortPosition(portInfo.element);
            
            // Create feedback line
            const svg = this.svgContainer.querySelector('svg > g');
            if (svg) {
                this.feedbackLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                this.feedbackLine.setAttribute('class', 'feedback-edge');
                const pos = this.state.sourcePosition;
                this.feedbackLine.setAttribute('d', `M ${pos.x} ${pos.y} L ${pos.x} ${pos.y}`);
                svg.appendChild(this.feedbackLine);
            }
            
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private handleMouseMove(e: MouseEvent): void {
        if (!this.state.isCreating || !this.feedbackLine || !this.state.sourcePosition) return;
        
        const svg = this.svgContainer.querySelector('svg') as SVGSVGElement;
        if (!svg) return;
        
        try {
            const mousePos = getSvgMousePosition(e, svg);
            
            // Draw orthogonal path (draw.io style - horizontal first, then vertical)
            const sx = this.state.sourcePosition.x;
            const sy = this.state.sourcePosition.y;
            const midX = sx + (mousePos.x - sx) / 2;
            
            // Orthogonal routing: horizontal -> vertical -> horizontal
            const pathData = `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${mousePos.y} L ${mousePos.x} ${mousePos.y}`;
            this.feedbackLine.setAttribute('d', pathData);
            
            // Highlight valid targets
            document.querySelectorAll('.port-valid-target').forEach(el => 
                el.classList.remove('port-valid-target')
            );
            
            const target = document.elementFromPoint(e.clientX, e.clientY);
            if (target) {
                const targetPortInfo = findPortInfo(target);
                if (targetPortInfo && targetPortInfo.type === 'input') {
                    targetPortInfo.element.classList.add('port-valid-target');
                }
            }
        } catch (error) {
            console.error('❌ [DEBUG] Mouse move error:', error);
        }
    }

    private handleMouseUp(e: MouseEvent): void {
        if (!this.state.isCreating) return;
        
        try {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            
            if (target) {
                const targetPortInfo = findPortInfo(target);
                
                if (targetPortInfo && targetPortInfo.type === 'input' && this.state.sourcePortId) {
                    // const targetPosition = getPortPosition(targetPortInfo.element);

                    // Log view transform at end of edge creation
                    getViewTransform();
                    const result = this.graphModel.addEdge(this.state.sourcePortId, targetPortInfo.id);
                    
                    if (result.success) {
                        this.onModelUpdate();
                    } else {
                        console.log(`⚠️ [DEBUG] Edge creation failed: ${result.message}`);
                    }
                } else {
                    console.log('❌ [DEBUG] Edge creation cancelled - dropped on invalid target');
                }
            }
            
        } catch (error) {
            console.error('❌ [DEBUG] Edge creation error:', error);
        } finally {
            this.cleanup();
        }
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape' && this.state.isCreating) {
            this.cleanup();
        }
    }

    private cleanup(): void {
        try {
            document.querySelectorAll('.port-valid-target').forEach(el => 
                el.classList.remove('port-valid-target')
            );
            
            if (this.feedbackLine && this.feedbackLine.parentNode) {
                this.feedbackLine.remove();
            }
            this.feedbackLine = null;
            
            this.state.isCreating = false;
            this.state.sourcePortId = null;
            this.state.sourcePosition = null;
        } catch (error) {
            console.error('❌ [DEBUG] Cleanup error:', error);
        }
    }
}
