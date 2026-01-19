import { inject, injectable } from 'inversify';
import { VNode } from 'snabbdom';
import { IView, RenderingContext, SNodeImpl, SPortImpl, SEdgeImpl, TYPES, IActionDispatcher } from 'sprotty';
import { h } from 'snabbdom';
import { PortShape, PortSide, Position } from './types';
import { ResizeAction } from './model/ResizeAction';

/**
 * View for process nodes - renders as rectangles with labels
 */
@injectable()
export class ProcessNodeView implements IView {
    @inject(TYPES.IActionDispatcher) private readonly actionDispatcher!: IActionDispatcher;

    private resizing: {
        nodeId: string;
        startX: number;
        startY: number;
        startWidth: number;
        startHeight: number;
        startBoundsX: number;
        startBoundsY: number;
    } | null = null;

    render(node: any, context: RenderingContext): VNode {
        const nodeData = node as any;
        const name = nodeData.name || node.id;

        // Calculate rotation transform
        const rotation = node.rotation || 0;
        const centerX = node.size.width / 2;
        const centerY = node.size.height / 2;

        let transformAttr = '';
        if (rotation === -360 || rotation === 360) {
            transformAttr = ''
        } else {
            transformAttr = `translate(${centerX} ${centerY}) rotate(${rotation}) translate(${-centerX} ${-centerY})`;
        }

        // Create a group for visual content (rect + text) that will be rotated
        const visualContentGroup = h('g', {
            class: { 'node-content': true },
            attrs: {
                transform: transformAttr.trim()
            }
        }, [
            h('rect', {
                class: { 'node-body': true },
                attrs: {
                    x: 0,
                    y: 0,
                    width: node.bounds.width,
                    height: node.bounds.height,
                    rx: 4
                }
            }),
            h('text', {
                class: { 'node-label': true },
                attrs: {
                    x: node.bounds.width / 2,
                    y: node.bounds.height / 2 + 5,
                    'text-anchor': 'middle'
                }
            }, [name])
        ]);
        const resizeHandle = h('rect', {
            class: { 'resize-handle': true },
            attrs: {
                x: node.bounds.width - 5,
                y: node.bounds.height - 5,
                width: 8,
                height: 8
            },
            on: {
                mousedown: (event: MouseEvent) => {
                    event.stopPropagation();
                    event.preventDefault();
                    this.startResize(event, node, context);
                }
            }
        });

        const children = context.renderChildren(node);
        
        return h('g', {
            class: {
                'sprotty-node': true,
                'node-process': true
            }
        }, [visualContentGroup, resizeHandle, ...children]);
    }

    private startResize(event: MouseEvent, node: any, context: RenderingContext): void {
        this.resizing = {
            nodeId: node.id,
            startX: event.clientX,
            startY: event.clientY,
            startWidth: node.bounds.width,
            startHeight: node.bounds.height,
            startBoundsX: node.bounds.x,
            startBoundsY: node.bounds.y
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!this.resizing) return;

            const deltaX = e.clientX - this.resizing.startX;
            const deltaY = e.clientY - this.resizing.startY;

            const newWidth = Math.max(50, this.resizing.startWidth + deltaX);
            const newHeight = Math.max(30, this.resizing.startHeight + deltaY);

            // Dispatch resize action
            const resizeAction = {
                kind: 'resize',
                nodeId: this.resizing.nodeId,
                newBounds: {
                    x: this.resizing.startBoundsX,
                    y: this.resizing.startBoundsY,
                    width: newWidth,
                    height: newHeight
                }
            };
            const action = ResizeAction.create({ nodeId: this.resizing.nodeId, newBounds: resizeAction.newBounds });
            this.actionDispatcher.dispatch(action);
        };

        const handleMouseUp = () => {
            this.resizing = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
}

/**
 * View for flow ports - renders different shapes based on port configuration
 * Supports: circle, square, diamond, triangle
 */
@injectable()
export class FlowPortView implements IView {
    render(port: SPortImpl, context: RenderingContext): VNode {
        const portData = port as any;
        const portType = portData.portType || 'input';
        const shape: PortShape = portData.shape || 'circle';
        const side: PortSide = portData.side || 'left';
        const label = portData.label || '';
        const size = 16;
        const center = size / 2;
        // Debug logging for port position (relative to parent node)
        // const icon = portType === 'output' ? '🟢' : '🔴';
        // const shapeIcon = this.getShapeIcon(shape);
        // console.log(`${icon}${shapeIcon} [RENDER] Port "${port.id}" (${portType}, ${shape}) at local position: x=${port.bounds.x.toFixed(1)}, y=${port.bounds.y.toFixed(1)}`);
        
        const children: VNode[] = [
            this.renderShape(shape, center, portType, side, portData)
        ];

        // Add label if it exists
        if (label) {
            children.push(this.renderLabel(label, side, portData));
        }
        
        return h('g', {
            class: {
                'sprotty-port': true,
                'port-flow': true,
                'port-input': portType === 'input',
                'port-output': portType === 'output',
                [`port-shape-${shape}`]: true,
                [`port-side-${side}`]: true
            }
        }, children);
    }

    /**
     * Get emoji icon for shape (for debug logging)
     */
    private getShapeIcon(shape: PortShape): string {
        switch (shape) {
            case 'circle': return '●';
            case 'square': return '■';
            case 'diamond': return '◆';
            case 'triangle': return '▲';
            default: return '●';
        }
    }

    /**
     * Render the appropriate SVG shape based on port configuration
     */
    private renderShape(shape: PortShape, center: number, portType: 'input' | 'output', side: PortSide, portData: SPortImpl): VNode {
        const radius = 8;
        
        switch (shape) {
            case 'circle':
                return this.renderCircle(center, radius);
            case 'square':
                return this.renderSquare(center, radius, portData);
            case 'diamond':
                return this.renderDiamond(center, radius);
            case 'triangle':
                return this.renderTriangle(center, radius, portType, side);
            default:
                return this.renderCircle(center, radius);
        }
    }

    /**
     * Render circle port (default shape)
     */
    private renderCircle(center: number, radius: number): VNode {
        return h('circle', {
            class: { 'port-body': true },
            attrs: {
                cx: center,
                cy: center,
                r: radius
            }
        });
    }

    /**
     * Render square port
     */
    private renderSquare(center: number, radius: number, portData: SPortImpl): VNode {
        const size = radius * 1.6; // Slightly smaller than diameter for visual balance
        const offset = center - size / 2;
        
        return h('rect', {
            class: { 'port-body': true },
            attrs: {
                x: offset,
                y: offset,
                width: portData.bounds.width,
                height: portData.bounds.height,
                rx: 2 // Slight rounding for aesthetics
            }
        });
    }

    /**
     * Render diamond port (rotated square)
     */
    private renderDiamond(center: number, radius: number): VNode {
        const size = radius * 1.4;
        const points = [
            `${center},${center - size}`,      // top
            `${center + size},${center}`,      // right
            `${center},${center + size}`,      // bottom
            `${center - size},${center}`       // left
        ].join(' ');
        
        return h('polygon', {
            class: { 'port-body': true },
            attrs: {
                points
            }
        });
    }

    /**
     * Render triangle port - direction depends on port type and side
     * Input ports point inward, output ports point outward
     */
    private renderTriangle(center: number, radius: number, portType: 'input' | 'output', side: PortSide): VNode {
        const size = radius * 1.3;
        let points: string;

        // Determine triangle direction based on side and port type
        const pointsInward = portType === 'input';
        
        switch (side) {
            case 'left':
                if (pointsInward) {
                    // Points right (into node)
                    points = [
                        `${center - size * 0.8},${center - size}`,  // top-left
                        `${center + size},${center}`,               // right point
                        `${center - size * 0.8},${center + size}`   // bottom-left
                    ].join(' ');
                } else {
                    // Points left (out of node)
                    points = [
                        `${center + size * 0.8},${center - size}`,  // top-right
                        `${center - size},${center}`,               // left point
                        `${center + size * 0.8},${center + size}`   // bottom-right
                    ].join(' ');
                }
                break;
                
            case 'right':
                if (pointsInward) {
                    // Points left (into node)
                    points = [
                        `${center + size * 0.8},${center - size}`,  // top-right
                        `${center - size},${center}`,               // left point
                        `${center + size * 0.8},${center + size}`   // bottom-right
                    ].join(' ');
                } else {
                    // Points right (out of node)
                    points = [
                        `${center - size * 0.8},${center - size}`,  // top-left
                        `${center + size},${center}`,               // right point
                        `${center - size * 0.8},${center + size}`   // bottom-left
                    ].join(' ');
                }
                break;
                
            case 'top':
                if (pointsInward) {
                    // Points down (into node)
                    points = [
                        `${center - size},${center - size * 0.8}`,  // top-left
                        `${center + size},${center - size * 0.8}`,  // top-right
                        `${center},${center + size}`                // bottom point
                    ].join(' ');
                } else {
                    // Points up (out of node)
                    points = [
                        `${center - size},${center + size * 0.8}`,  // bottom-left
                        `${center + size},${center + size * 0.8}`,  // bottom-right
                        `${center},${center - size}`                // top point
                    ].join(' ');
                }
                break;
                
            case 'bottom':
                if (pointsInward) {
                    // Points up (into node)
                    points = [
                        `${center - size},${center + size * 0.8}`,  // bottom-left
                        `${center + size},${center + size * 0.8}`,  // bottom-right
                        `${center},${center - size}`                // top point
                    ].join(' ');
                } else {
                    // Points down (out of node)
                    points = [
                        `${center - size},${center - size * 0.8}`,  // top-left
                        `${center + size},${center - size * 0.8}`,  // top-right
                        `${center},${center + size}`                // bottom point
                    ].join(' ');
                }
                break;
                
            default:
                // Default: right-pointing triangle
                points = [
                    `${center - size * 0.8},${center - size}`,
                    `${center + size},${center}`,
                    `${center - size * 0.8},${center + size}`
                ].join(' ');
        }
        
        return h('polygon', {
            class: { 'port-body': true },
            attrs: {
                points
            }
        });
    }

    /**
     * Render label for port
     */
    private renderLabel(label: string, side: PortSide, portData: any): VNode {
        const portWidth = portData.bounds.width || 16;
        const portHeight = portData.bounds.height || 16;
        let x = portWidth / 2;
        let y = portHeight + 15; // Default: below port
        let textAnchor = 'middle';

        // Adjust label position based on port side
        switch (side) {
            case 'left':
                x = 20;
                y = -5;
                textAnchor = 'end';
                break;
            case 'right':
                x = 5;
                y = -5;
                textAnchor = 'start';
                break;
            case 'top':
                x = portWidth / 2;
                y = -5;
                textAnchor = 'middle';
                break;
            case 'bottom':
                x = portWidth / 2;
                y = portHeight + 15;
                textAnchor = 'middle';
                break;
        }

        return h('text', {
            class: { 'port-label': true },
            attrs: {
                x,
                y,
                'text-anchor': textAnchor,
                'dominant-baseline': 'middle'
            }
        }, label);
    }
}

/**
 * View for flow edges - renders as orthogonal paths (draw.io style)
 */
@injectable()
export class FlowEdgeView implements IView {
    render(edge: SEdgeImpl, context: RenderingContext): VNode {
        const path = this.createEdgePath(edge);
        
        return h('g', {
            class: {
                'sprotty-edge': true,
                'edge-flow': true
            }
        }, [
            // Define arrow marker
            h('defs', {}, [
                h('marker', {
                    attrs: {
                        id: `arrow-${edge.id}`,
                        markerWidth: '7',
                        markerHeight: '6',
                        refX: '5',
                        refY: '2',
                        orient: 'auto',
                        markerUnits: 'strokeWidth'
                    }
                }, [
                    h('path', {
                        attrs: {
                            d: 'M-6,0 L0,3 L5,2 z',
                            fill: '#333'
                        }
                    })
                ])
            ]),
            h('path', {
                attrs: {
                    d: path,
                    'marker-end': `url(#arrow-${edge.id})`
                }
            })
        ]);
    }
    
    private createEdgePath(edge: SEdgeImpl): string {
        const source = edge.source;
        const target = edge.target;
        
        if (!source || !target) {
            console.warn(`⚠️ [RENDER] Edge "${edge.id}" has missing source or target`);
            return '';
        }
        
        const sourcePoint = this.getAbsolutePosition(source);
        const targetPoint = this.getAbsolutePosition(target);
        
        // Debug logging for edge positions
        return this.createOrthogonalPath(sourcePoint, targetPoint);
    }
    
    private getAbsolutePosition(element: any): Position {
        let x = element.bounds.x + element.bounds.width / 2;
        let y = element.bounds.y + element.bounds.height / 2;
        
        // Traverse up the hierarchy to accumulate all parent positions
        let current = element.parent;
        while (current && current.type !== 'graph') {
            if (current.bounds) {
                x += current.bounds.x;
                y += current.bounds.y;
            }
            current = current.parent;
        }
        
        return { x, y };
    }
    
    /**
     * Creates an orthogonal path (Manhattan routing) - draw.io style
     * The path goes: horizontal -> vertical -> horizontal
     */
    private createOrthogonalPath(source: Position, target: Position): string {
        const midX = source.x + (target.x - source.x) / 2;
        
        return `M ${source.x + 10} ${source.y} ` +
               `L ${midX} ${source.y} ` +        // horizontal from source
               `L ${midX} ${target.y} ` +        // vertical to target height
               `L ${target.x - 10} ${target.y}`;      // horizontal to target
    }
}

/**
 * View for svg node - renders as orthogonal paths (draw.io style)
 */
@injectable()
export class SvgNodeView implements IView {
  private parser = new DOMParser();

  private cleanSvgContent(svgContent: string): string {
    if (!svgContent || !svgContent.trim()) {
      return '';
    }

    try {
      // Remove HTML comments first
      let cleanContent = svgContent.replace(/<!--[\s\S]*?-->/g, '');

      // Remove escaped newlines and tabs (but keep escaped quotes)
      cleanContent = cleanContent
        .replace(/\\n/g, '') // Remove \n
        .replace(/\\t/g, '') // Remove \t
        .replace(/\n/g, '') // Remove actual newlines
        .replace(/\t/g, '') // Remove actual tabs
        .replace(/\r/g, ''); // Remove carriage returns

      // Unescape double quotes: \" -> "
      // This handles cases like: data-attribute-class=\"Central Boiler\" -> data-attribute-class="Central Boiler"
      cleanContent = cleanContent.replace(/\\"/g, '"');
      
      // Unescape single quotes: \' -> '
      cleanContent = cleanContent.replace(/\\'/g, "'");

      // Normalize multiple spaces to single space
      cleanContent = cleanContent.replace(/\s+/g, ' ').trim();

      return cleanContent;
    } catch (error) {
      console.error('Error cleaning SVG content:', error);
      return svgContent;
    }
  }

  render(node: any, context: RenderingContext): VNode {
    const cleanedSvgContent = this.cleanSvgContent(node.svgContent);

    // Debug log to check cleaned content
    if (!cleanedSvgContent) {
      console.warn('Empty SVG content for node:', node.id);
      return h('g', { class: { 'sprotty-node': true, 'node-svg': true } }, context.renderChildren(node));
    }

    const doc = this.parser.parseFromString(cleanedSvgContent, 'image/svg+xml');
    
    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.error('SVG parsing error for node:', node.id, parserError.textContent);
      console.error('Cleaned SVG content:', cleanedSvgContent);
      return h('g', { class: { 'sprotty-node': true, 'node-svg': true } }, context.renderChildren(node));
    }

    const svg = doc.querySelector('svg');
    if (!svg) {
      console.warn('No SVG element found for node:', node.id);
      return h('g', { class: { 'sprotty-node': true, 'node-svg': true } }, context.renderChildren(node));
    }

    // Remove port elements from SVG content to avoid duplication
    // Ports will be rendered separately by Sprotty
    const portsToRemove = svg.querySelectorAll('[data-attribute="port"]');
    portsToRemove.forEach(port => port.remove());

    // Calculate rotation transform
    const rotation = node.rotation || 0;
    const centerX = node.size.width / 2;
    const centerY = node.size.height / 2;

    let transformAttr = '';
    if (rotation === -360 || rotation === 360) {
        transformAttr = ''
    } else {
        transformAttr = `translate(${centerX} ${centerY}) rotate(${rotation}) translate(${-centerX} ${-centerY})`;
    }

    // Create SVG group element
    const svgContentGroup = h(
        'g',
        {
            class: { 'svg-content': true },
            hook: {
                insert: (vnode: VNode) => {
                    if (vnode.elm && svg) {
                        while (svg.firstChild) {
                            vnode.elm.appendChild(svg.firstChild);
                        }
                    }
                },
            },
            attrs: {
                transform: transformAttr.trim()
            }
        },
        [],
    );

    // Render children (ports) after SVG content
    const children = context.renderChildren(node);

    return h('g', {
        class: {
          'sprotty-node': true,
          'node-svg': true
        },
    }, [svgContentGroup, ...children]);
  }
}

@injectable()
export class PackageNodeView implements IView {
    render(node: any, context: RenderingContext): VNode {
        const nodeData = node as any;
        const name = nodeData.name || node.id;
        
        // Calculate rotation transform
        const rotation = node.rotation || 0;
        const centerX = node.size.width / 2;
        const centerY = node.size.height / 2;
        let transformAttr = '';
        if (rotation === -360 || rotation === 360) {
            transformAttr = ''
        } else {
            transformAttr = `translate(${centerX} ${centerY}) rotate(${rotation}) translate(${-centerX} ${-centerY})`;
        }

        // Create a group for visual content (rect + text) that will be rotated
        const visualContentGroup = h('g', {
            class: { 'node-content': true },
            attrs: {
                transform: transformAttr.trim()
            }
        }, [
            h('rect', {
                class: { 'node-body': true },
                attrs: {
                    x: 0,
                    y: 0,
                    width: node.bounds.width,
                    height: node.bounds.height,
                    rx: 6
                }
            }, [name]),
        ]);

        const children = context.renderChildren(node);
        
        return h('g', {
            class: {
                'sprotty-node': true,
                'node-package': true
            }
        }, [visualContentGroup, ...children]);
    }
}
