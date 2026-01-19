import { inject } from 'inversify';
import { Command, CommandExecutionContext, CommandReturn, TYPES, SModelElementImpl } from "sprotty";
import { Bounds } from "sprotty-protocol";
import { ResizeAction } from "./ResizeAction";

export class ResizeCommand extends Command {
    static readonly KIND = ResizeAction.KIND;

    private readonly nodeId: string;
    private readonly newBounds: Bounds;
    private oldBounds?: Bounds;
    
    constructor(@inject(TYPES.Action) protected readonly action: ResizeAction) {
        super();
        this.nodeId = action.nodeId;
        this.newBounds = action.newBounds;
    }

    execute(context: CommandExecutionContext): CommandReturn {
        const node = context.root.index.getById(this.nodeId);
        if (node && this.isResizable(node)) {
            // Store old bounds for undo
            this.oldBounds = {
                x: node.bounds.x,
                y: node.bounds.y,
                width: node.bounds.width,
                height: node.bounds.height
            };
            
            node.bounds = {
                x: this.newBounds.x,
                y: this.newBounds.y,
                width: this.newBounds.width,
                height: this.newBounds.height
            };
            
            // Update port positions based on new size
            if ('children' in node && Array.isArray(node.children)) {
                this.updatePortPositions(node, this.newBounds.width, this.newBounds.height);
            }
        }
        return context.root;
    }

    undo(context: CommandExecutionContext): CommandReturn {
        const node = context.root.index.getById(this.nodeId);
        if (node && this.oldBounds && this.isResizable(node)) {
            // Restore old bounds
            node.bounds = {
                x: this.oldBounds.x,
                y: this.oldBounds.y,
                width: this.oldBounds.width,
                height: this.oldBounds.height
            };
            
            // Restore port positions
            if ('children' in node && Array.isArray(node.children)) {
                this.updatePortPositions(node, this.oldBounds.width, this.oldBounds.height);
            }
        }
        return context.root;
    }

    redo(context: CommandExecutionContext): CommandReturn {
        return this.execute(context);
    }

    private isResizable(element: SModelElementImpl): element is SModelElementImpl & { bounds: Bounds } {
        return 'bounds' in element;
    }
    
    private updatePortPositions(node: any, width: number, height: number): void {
        const PORT_OFFSET = 8;
        
        // Group ports by side
        const portsPerSide: Record<string, any[]> = {
            left: [],
            right: [],
            top: [],
            bottom: []
        };
        
        node.children.forEach((child: any) => {
            if (child.type === 'port:flow') {
                const side = child.side || 'left';
                portsPerSide[side].push(child);
            }
        });
        
        // Update positions for each side
        Object.entries(portsPerSide).forEach(([side, ports]) => {
            ports.forEach((port, index) => {
                const totalOnSide = ports.length;
                let x = 0, y = 0;
                
                switch (side) {
                    case 'left':
                        x = -PORT_OFFSET;
                        y = this.distributeAlongAxis(index, totalOnSide, height);
                        break;
                    case 'right':
                        x = width - PORT_OFFSET;
                        y = this.distributeAlongAxis(index, totalOnSide, height);
                        break;
                    case 'top':
                        x = this.distributeAlongAxis(index, totalOnSide, width);
                        y = -PORT_OFFSET;
                        break;
                    case 'bottom':
                        x = this.distributeAlongAxis(index, totalOnSide, width);
                        y = height - PORT_OFFSET;
                        break;
                }
                
                port.bounds = {
                    x,
                    y,
                    width: port.bounds.width,
                    height: port.bounds.height
                };
            });
        });
    }
    
    private distributeAlongAxis(index: number, total: number, length: number): number {
        const PORT_SIZE = 16;
        if (total === 1) {
            return (length - PORT_SIZE) / 2;
        }
        const usableLength = length - PORT_SIZE;
        const spacing = usableLength / (total - 1);
        return spacing * index;
    }
}