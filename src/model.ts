import { SNodeImpl } from "sprotty";
import { ICreateNode, ICreateNodeWithPorts, IImportSvgNodes, NodeSize, PackageNode, PortConfig, PortSide, SprottyEdge, SprottyGraph, SprottyNode, SprottyPort, SprottySvgNode, SvgNode } from "./types";

export class GraphModel {
    private model: SprottyGraph;
    private edgeCounter: number = 0;

    // Default node size
    private static DEFAULT_NODE_SIZE: NodeSize = { width: 120, height: 60 };
    private static PORT_SIZE = 16;
    private static PORT_OFFSET = 8; // Half of port size, for centering

    constructor() {
        this.model = this.createInitialModel();
    }

    /**
     * Calculate port position based on side and index
     * Distributes ports evenly along the specified side
     */
    private calculatePortPosition(
        side: PortSide, 
        index: number, 
        totalOnSide: number, 
        nodeSize: NodeSize
    ): { x: number; y: number } {
        const portOffset = GraphModel.PORT_OFFSET;
        
        switch (side) {
            case 'left':
                return {
                    x: -portOffset,
                    y: this.distributeAlongAxis(index, totalOnSide, nodeSize.height)
                };
            case 'right':
                return {
                    x: nodeSize.width - portOffset,
                    y: this.distributeAlongAxis(index, totalOnSide, nodeSize.height)
                };
            case 'top':
                return {
                    x: this.distributeAlongAxis(index, totalOnSide, nodeSize.width),
                    y: -portOffset
                };
            case 'bottom':
                return {
                    x: this.distributeAlongAxis(index, totalOnSide, nodeSize.width),
                    y: nodeSize.height - portOffset
                };
        }
    }

    /**
     * Distribute items evenly along an axis
     */
    private distributeAlongAxis(index: number, total: number, length: number): number {
        if (total === 1) {
            return (length - GraphModel.PORT_SIZE) / 2;
        }
        const usableLength = length - GraphModel.PORT_SIZE;
        const spacing = usableLength / (total - 1);
        return spacing * index;
    }

    /**
     * Create a node with flexible port configuration
     */
    public createNodeWithPorts({
        id,
        x,
        y,
        name,
        ports,
        size,
        flipHorizontal = null,
        flipVertical = null,
        rotation = 0
    }: ICreateNodeWithPorts): SprottyNode {
        // Count ports per side for positioning
        const portsPerSide: Record<PortSide, PortConfig[]> = {
            left: [],
            right: [],
            top: [],
            bottom: []
        };

        ports.forEach(port => {
            portsPerSide[port.side].push(port);
        });

        // Create port elements with calculated positions
        const children: SprottyPort[] = [];
        
        Object.entries(portsPerSide).forEach(([side, sidePorts]) => {
            sidePorts.forEach((port, index) => {
                const position = this.calculatePortPosition(
                    side as PortSide,
                    port.index ?? index,
                    sidePorts.length,
                    size
                );

                const portId = port.id 
                    ? `${id}-${port.id}` 
                    : `${id}-${side}-${port.type}-${index}`;

                children.push({
                    type: 'port:flow',
                    id: portId,
                    position,
                    size: { width: GraphModel.PORT_SIZE, height: GraphModel.PORT_SIZE },
                    portType: port.type,
                    shape: port.shape || 'circle',
                    side: side as PortSide,
                    label: port.label
                });
            });
        });

        return {
            type: 'node:process',
            id,
            position: { x, y },
            size: { width: size.width, height: size.height },
            name,
            children,
            flipHorizontal,
            flipVertical,
            rotation
        };
    }

    /**
     * Legacy method for backward compatibility - creates simple in/out ports
     */
    public createNode({
        id,
        x,
        y,
        name,
        ports,
        size = GraphModel.DEFAULT_NODE_SIZE,
        flipHorizontal = null,
        flipVertical = null,
        rotation = 0
    }: ICreateNode): SprottyNode {
        const portConfigs: PortConfig[] = [];
        
        if (ports.includes('in')) {
            portConfigs.push({ type: 'input', side: 'left', id: 'in' });
        }
        
        if (ports.includes('out')) {
            portConfigs.push({ type: 'output', side: 'right', id: 'out' });
        }
        
        return this.createNodeWithPorts({
            id, 
            x, 
            y, 
            name, 
            ports: portConfigs,
            size,
            flipHorizontal,
            flipVertical,
            rotation,
        });
    }

    /**
     * Create a package node that can contain child nodes
     * Children are positioned relative to the package node's position
     */
    public createPackageNode({
        id,
        x,
        y,
        name,
        size = { width: 400, height: 300 },
        children = [],
        rotation = 0
    }: {
        id: string;
        x: number;
        y: number;
        name: string;
        size?: NodeSize;
        children?: Array<SprottyNode | SvgNode>;
        rotation?: number;
    }): any {
        // Convert child nodes to have positions relative to package node
        const relativeChildren = children.map(child => ({
            ...child,
            position: {
                x: child.position.x,
                y: child.position.y
            }
        }));

        return {
            type: 'node:package',
            id,
            position: { x, y },
            size,
            name,
            children: relativeChildren,
            rotation
        };
    }

    /**
     * Rotate a point around a center point by a given angle in degrees
     */
    public static rotatePoint(
        x: number,
        y: number,
        centerX: number,
        centerY: number,
        angleDegrees: number
    ): { x: number; y: number } {
        // Convert angle to radians
        const angleRad = (angleDegrees * Math.PI) / 180;
        
        // Translate point to origin
        const translatedX = x - centerX;
        const translatedY = y - centerY;
        
        // Apply rotation
        const rotatedX = translatedX * Math.cos(angleRad) - translatedY * Math.sin(angleRad);
        const rotatedY = translatedX * Math.sin(angleRad) + translatedY * Math.cos(angleRad);
        
        // Translate back
        return {
            x: rotatedX + centerX,
            y: rotatedY + centerY
        };
    }

    /**
     * Parse transform attribute from SVG to extract rotation
     * Supports: rotate(angle) or rotate(angle, cx, cy)
     */
    private parseTransformFromSvg(svgContent: string): { rotation: number; viewBox?: string } {
        if (!svgContent) return { rotation: 0 };

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'image/svg+xml');
        const svg = doc.querySelector('svg');

        if (!svg) return { rotation: 0 };

        // Get viewBox attribute
        const viewBox = svg.getAttribute('viewBox') || undefined;

        // Look for <g> element with transform attribute
        const gElement = svg.querySelector('g[transform]');
        if (!gElement) return { rotation: 0, viewBox };

        const transform = gElement.getAttribute('transform');
        if (!transform) return { rotation: 0, viewBox };

        // Parse rotate() from transform
        // Format: rotate(angle) or rotate(angle, cx, cy)
        const rotateMatch = transform.match(/rotate\(([^)]+)\)/);
        if (rotateMatch) {
            const values = rotateMatch[1].split(/[,\s]+/).map(v => parseFloat(v.trim()));
            if (values.length === 1) {
                return { rotation: values[0], viewBox };
            } else if (values.length === 3) {
                return { 
                    rotation: values[0],
                    viewBox
                };
            }
        }

        return { 
            rotation: 0,
            viewBox
        };
    }

    /**
     * Extract port information from SVG rect element
     */
    public static extractPortInfo(element: Element, nodeId: string, index: number): {
        portClass: string;
        portId: string;
        portAttributeType: string;
        x: number;
        y: number;
        width: number;
        height: number;
    } {
        const rect = element as SVGRectElement;
        const portClass = rect.getAttribute('data-attribute-class') || '';
        const portId = rect.getAttribute('data-attribute-id') ? `${nodeId}-${portClass}` : `${nodeId}-port-${index}`;
        const portAttributeType = rect.getAttribute('data-attribute-type') || '';
        const x = parseFloat(rect.getAttribute('x') || '0');
        const y = parseFloat(rect.getAttribute('y') || '0');
        const width = parseFloat(rect.getAttribute('width') || '0');
        const height = parseFloat(rect.getAttribute('height') || '0');

        return { portClass, portId, portAttributeType, x, y, width, height };
    }

    /**
     * Calculate port position with rotation applied
     */
    public static calculatePortPositionWithRotation(
        x: number,
        y: number,
        width: number,
        height: number,
        rotation: number,
        centerX: number,
        centerY: number
    ): { x: number; y: number } {
        // Apply rotation to port position if rotation is not 0
        if (rotation !== 0 && rotation !== -360 && rotation !== 360) {
            const portCenterX = x + width / 2;
            const portCenterY = y + height / 2;
            
            const rotated = GraphModel.rotatePoint(
                portCenterX,
                portCenterY,
                centerX,
                centerY,
                rotation
            );
            
            // Adjust back to top-left corner
            return {
                x: rotated.x - width / 2,
                y: rotated.y - height / 2
            };
        }
        
        return { x, y };
    }

    /**
     * Create SVG node from external SVG file
     */
    private parsePortsFromSvg({ 
        svgContent, 
        id, 
        rotation = 0,
        centerX,
        centerY 
    }: { 
        svgContent: string; 
        id: string;
        rotation?: number;
        centerX: number;
        centerY: number;
    }): SprottyPort[] {
        if (!svgContent) return [];

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        
        if (!svg) return [];

        // Find all elements with data-attribute="port"
        const portElements = svg.querySelectorAll('[data-attribute="port"]');
        const ports: SprottyPort[] = [];

        portElements.forEach((element, index) => {
            // Extract port information
            const portInfo = GraphModel.extractPortInfo(element, id, index);
            
            // Calculate position with rotation
            const position = GraphModel.calculatePortPositionWithRotation(
                portInfo.x,
                portInfo.y,
                portInfo.width,
                portInfo.height,
                rotation,
                centerX,
                centerY
            );

            // Determine port type and side
            let portType: 'input' | 'output' = 'output';
            let side: PortSide = 'right';

            if (portInfo.portAttributeType === 'in') {
                portType = 'input';
                side = 'left';
            }

            ports.push({
                type: 'port:flow',
                id: portInfo.portId,
                position,
                size: { width: portInfo.width, height: portInfo.height },
                shape: 'square',
                portType,
                side,
                label: portInfo.portClass
            });
        });

        return ports;
    }

    private createSvgNode({
        id,
        x = 0,
        y = 0,
        name,
        svgContent = '',
        rotation = 0,
        flipHorizontal = null,
        flipVertical = null
    }: SprottySvgNode): SvgNode {
        const transformData = this.parseTransformFromSvg(svgContent);
        const viewBoxX = transformData.viewBox ? parseFloat(transformData.viewBox.split(' ')[2]) : 0;
        const viewBoxY = transformData.viewBox ? parseFloat(transformData.viewBox.split(' ')[3]) : 0;
        
        const centerX = viewBoxX / 2;
        const centerY = viewBoxY / 2;

        // Parse ports with rotation applied
        const children: SprottyPort[] = [];
        const svgPorts = this.parsePortsFromSvg({
            svgContent, 
            id,
            rotation,
            centerX,
            centerY
        });
        children.push(...svgPorts);

        return {
            type: 'node:svg',
            id,
            position: { x, y },
            size: { width: viewBoxX, height: viewBoxY },
            name,
            children,
            svgContent,
            rotation,
            flipHorizontal,
            flipVertical
        };
    }

    private createInitialModel(): SprottyGraph {
        return {
            type: 'graph',
            id: 'root',
            children: [
                // Sample package node with child nodes
                
                // this.createNode({
                //     id: 'node1',
                //     x: 50,
                //     y: 100,
                //     name: 'Source',
                //     ports: ['out'],
                // }),
                // this.createNodeWithPorts({
                //     id: 'node2',
                //     x: 250,
                //     y: 30,
                //     name: 'Multi-Port A',
                //     ports:[
                //         { type: 'input', side: 'left', shape: 'circle', id: 'in1' },
                //         { type: 'input', side: 'left', shape: 'square', id: 'in2' },
                //         { type: 'input', side: 'left', shape: 'diamond', id: 'in3' },
                //         { type: 'output', side: 'right', shape: 'circle', id: 'out1' },
                //         { type: 'output', side: 'right', shape: 'triangle', id: 'out2' },
                //     ], size: { width: 140, height: 80 }
                // }),
                // this.createNodeWithPorts({
                //     id: 'node3',
                //     x: 250,
                //     y: 180,
                //     name: 'All Sides',
                //     ports: [
                //         { type: 'input', side: 'left', shape: 'circle', id: 'in' },
                //         { type: 'output', side: 'right', shape: 'circle', id: 'out' },
                //         { type: 'input', side: 'top', shape: 'triangle', id: 'top-in' },
                //         { type: 'output', side: 'bottom', shape: 'triangle', id: 'bottom-out' },
                //     ], size: { width: 120, height: 80 },
                //     flipHorizontal: 0,
                //     flipVertical: 0
                // }),
                // this.createNodeWithPorts({
                //     id: 'node4',
                //     x: 450,
                //     y: 50,
                //     name: 'Shape Demo',
                //     ports: [
                //         { type: 'input', side: 'left', shape: 'circle', id: 'circle-in' },
                //         { type: 'input', side: 'left', shape: 'square', id: 'square-in' },
                //         { type: 'output', side: 'right', shape: 'diamond', id: 'diamond-out' },
                //         { type: 'output', side: 'right', shape: 'triangle', id: 'triangle-out' },
                //     ], size: { width: 120, height: 80 }
                // }),
                
                // SVG Boiler node
                // this.createSvgNode({
                //     id: 'Pump1',
                //     x: 100,
                //     y: 300,
                //     name: 'Pump:VariableSpeed',
                //     size: { width: 200, height: 200 },
                //     svgContent: "<!-- \n        Pump:VariableSpeed\n    \t-->\n\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 500 500\">\n  <ellipse style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\" cx=\"235.112\" cy=\"227.047\" rx=\"73.777\" ry=\"73.777\"></ellipse>\n  <rect data-attribute=\"port\" data-attribute-type=\"in\" data-attribute-id=\"Inlet Node\" data-attribute-class=\"HW Pump Inlet Node\" x=\"139.578\" y=\"215.881\" width=\"21.092\" height=\"24.814\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n  <rect data-attribute=\"port\" data-attribute-type=\"out\" data-attribute-class=\"HW Pump Outlet Node\" x=\"308.933\" y=\"218.983\" width=\"21.092\" height=\"24.194\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n  <path style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\" d=\"M 308.313 228.701 L 185.484 173.49 L 186.724 281.431\"></path>\n  <polyline style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\" points=\"186.724 282.052 308.313 229.322\"></polyline>\n</svg>\n\n<!-- \n        Port 1: middle left: inlet from HW Supply Inlet Node\n        Port 2: middle right: outlet to HW Pump Outlet Node\n    \t-->\n"
                // }),
                // this.createSvgNode({
                //     id: 'Boiler2',
                //     x: 300,
                //     y: 500,
                //     name: 'Boiler:HotWater',
                //     size: { width: 200, height: 200 },
                //     flipVertical: 33,
                //     svgContent: "<!-- \n        Boiler:HotWater\n    \t-->\n\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 500 500\">\n  <rect x=\"101.117\" y=\"193.617\" width=\"267.99\" height=\"148.263\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n  <rect data-attribute=\"port\" data-attribute-type=\"in\" data-attribute-class=\"HW Boiler Inlet Node\" x=\"219.603\" y=\"167.563\" width=\"30.397\" height=\"25.434\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n  <rect data-attribute=\"port\" data-attribute-type=\"out\" data-attribute-class=\"HW Boiler Outlet Node\" x=\"216.501\" y=\"340.64\" width=\"33.499\" height=\"27.916\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n  <text style=\"fill: rgb(51, 51, 51); font-family: &quot;Arial&quot;, sans-serif; font-size: 30.4262px; white-space: pre;\" transform=\"matrix(1.046004, 0, 0, 1.051725, -5.671626, -12.440201)\" x=\"109.801\" y=\"281.707\">          Boiler</text>\n</svg>\n\n<!-- \n        Port 1: up: inlet from Central Boiler Inlet Node\n        Port 2: down: outlet to Central Boiler Outlet Node\n    \t-->\n"
                // }),

                // this.createSvgNode({
                //     id: 'Connector:Splitter',
                //     x: 1000,
                //     y: 200,
                //     name: 'Connector:Splitter',
                //     rotation: 0,
                //     flipHorizontal: -10,
                //     flipVertical: 40,
                //     svgContent: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1000\" height=\"200\" viewBox=\"0 0 1000 200\">\n  <rect x=\"0.0\" y=\"70\" width=\"1000.0\" height=\"100\" style=\"fill:#ccc;stroke:black;stroke-width:2\" />\n  <rect data-attribute=\"port\" data-attribute-type=\"in\" data-attribute-class=\"Heating Supply Inlet Branch\" data-attribute-id=\"port-Heating Supply Inlet Branch\" x=\"-30.0\" y=\"110.0\" width=\"20\" height=\"20\" style=\"fill:#ddd;stroke:black\" />\n  <rect data-attribute=\"port\" data-attribute-type=\"out\" data-attribute-class=\"Central Boiler Branch\" data-attribute-id=\"port-splitter-Central Boiler Branch\" x=\"240.0\" y=\"190\" width=\"20\" height=\"20\" style=\"fill:#ddd;stroke:black\" />\n  <rect data-attribute=\"port\" data-attribute-type=\"out\" data-attribute-class=\"Heating Supply Bypass Branch\" data-attribute-id=\"port-splitter-Heating Supply Bypass Branch\" x=\"740.0\" y=\"190\" width=\"20\" height=\"20\" style=\"fill:#ddd;stroke:black\" />\n</svg>"
                // }),

                // this.createSvgNode({
                //     id: 'Pipe:Adiabatic',
                //     x: 300,
                //     y: 100,
                //     name: 'Pipe:Adiabatic',
                //     flipHorizontal: -30,
                //     svgContent: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 500 500\">\n<g>\n\n  <rect x=\"98.015\" y=\"225.806\" width=\"275.434\" height=\"52.73\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n  <rect data-attribute=\"port\" data-attribute-type=\"in\" data-attribute-class=\"Heating Demand Bypass Inlet Node\" data-attribute-id=\"port-Heating Demand Bypass Inlet Node\" x=\"373.449\" y=\"243.797\" width=\"19.231\" height=\"19.851\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n  <rect data-attribute=\"port\" data-attribute-type=\"out\" data-attribute-class=\"Heating Demand Bypass Outlet Node\" data-attribute-id=\"port-Heating Demand Bypass Outlet Node\" x=\"75.062\" y=\"240.695\" width=\"22.953\" height=\"19.231\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n\n</g>\n</svg>"
                // }),

                // this.createSvgNode({
                //     id: 'Pipe:Adiabatic:Rotate',
                //     x: 500,
                //     y: 500,
                //     name: 'Pipe:Adiabatic:Rotate',
                //     rotation: 90,
                //     svgContent: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 500 500\">\n  <g>\n    <rect x=\"98.015\" y=\"225.806\" width=\"275.434\" height=\"52.73\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n    <rect data-attribute=\"port\" data-attribute-type=\"in\" data-attribute-class=\"Heating Supply Bypass Inlet Node\" data-attribute-id=\"port-Heating Supply Bypass Inlet Node\" x=\"373.449\" y=\"243.797\" width=\"19.231\" height=\"19.851\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n    <rect data-attribute=\"port\" data-attribute-type=\"out\" data-attribute-class=\"Heating Supply Bypass Outlet Node\" data-attribute-id=\"port-Heating Supply Bypass Outlet Node\" x=\"75.062\" y=\"240.695\" width=\"22.953\" height=\"19.231\" style=\"fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);\"></rect>\n  </g>\n</svg>"
                // }),

                // Initial demo edges
                // {
                //     type: 'edge:flow',
                //     id: 'edge-demo-1',
                //     sourceId: 'node1-out',
                //     targetId: 'node2-in1'
                // },
                // {
                //     type: 'edge:flow',
                //     id: 'edge-demo-2',
                //     sourceId: 'node2-out1',
                //     targetId: 'node4-circle-in'
                // },
                // {
                //     type: 'edge:flow',
                //     id: 'edge-demo-3',
                //     sourceId: 'node4-diamond-out',
                //     targetId: 'node5-in'
                // }
            ]
        };
    }

    getModel(): SprottyGraph {
        return this.model;
    }

    /**
     * Load model from JSON
     * Replaces the current model with the imported one
     */
    loadFromJson(jsonModel: SprottyGraph): void {
        this.model = jsonModel;
        const edges = this.model.children.filter(child => child.type === 'edge:flow');
        const maxEdgeId = edges.reduce((max, edge) => {
            const match = edge.id.match(/edge-(\d+)/);
            if (match) {
                return Math.max(max, parseInt(match[1]));
            }
            return max;
        }, 0);
        this.edgeCounter = maxEdgeId;
        
        // Recalculate port positions for nodes with rotation
        this.recalculatePortPositionsForRotatedNodes();
    }

    /**
     * Recalculate port positions for all nodes that have rotation applied
     * This is needed when loading from JSON since port positions need to be
     * adjusted based on the node's rotation angle
     */
    private recalculatePortPositionsForRotatedNodes(): void {
        const nodes = this.model.children.filter(
            child => child.type === 'node:svg' || child.type === 'node:process'
        ) as (SvgNode | SprottyNode)[];

        nodes.forEach(node => {
            const svgNode = node as SvgNode;
            const rotation = svgNode.rotation;
            
            // Skip if no rotation or rotation is 0 or ±360
            if (!rotation || rotation === 0 || rotation === -360 || rotation === 360) {
                return;
            }

            const svgNodeWidth = svgNode.size.width || 0;
            const svgNodeHeight = svgNode.size.height || 0;

            // Calculate center of rotation
            const centerX = svgNodeWidth / 2;
            const centerY = svgNodeHeight / 2;

            // Get original port positions from svgContent if available
            if (svgNode.svgContent && svgNode.children) {
                this.updatePortPositionsFromSvg(svgNode, rotation, centerX, centerY);
            } else if (svgNode.children) {
                // If no SVG content, use the current positions as base
                this.rotateExistingPortPositions(svgNode, rotation, centerX, centerY);
            }
        });
    }

    /**
     * Update port positions by parsing the SVG content and applying rotation
     */
    private updatePortPositionsFromSvg(
        node: SvgNode,
        rotation: number,
        centerX: number,
        centerY: number
    ): void {
        const parser = new DOMParser();
        const doc = parser.parseFromString(node.svgContent!, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        
        if (!svg) return;

        const portElements = svg.querySelectorAll('[data-attribute="port"]');
        
        portElements.forEach((element, index) => {
            // Extract port information
            const portInfo = GraphModel.extractPortInfo(element, node.id, index);
            
            // Find corresponding port in children
            const port = node.children.find((p: any) => p.id === portInfo.portId);
            if (!port) return;

            // Calculate position with rotation
            const position = GraphModel.calculatePortPositionWithRotation(
                portInfo.x,
                portInfo.y,
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

    /**
     * Rotate existing port positions (when SVG content is not available)
     * This assumes port positions in JSON are the original unrotated positions
     */
    private rotateExistingPortPositions(
        node: SvgNode,
        rotation: number,
        centerX: number,
        centerY: number
    ): void {
        node.children.forEach((port: SprottyPort) => {
            // Calculate port center from current position
            const portCenterX = port.position.x + port.size.width / 2;
            const portCenterY = port.position.y + port.size.height / 2;
            
            // Apply rotation
            const rotated = GraphModel.rotatePoint(
                portCenterX,
                portCenterY,
                centerX,
                centerY,
                rotation
            );
            
            // Update port position (convert back to top-left corner)
            port.position.x = rotated.x - port.size.width / 2;
            port.position.y = rotated.y - port.size.height / 2;
        });
    }

    addSvgNode(config: SprottySvgNode): void {
        const newNode = this.createSvgNode(config);
        this.model.children.push(newNode);
    }

    /**
     * Add a node with ports to the model
     * Creates a node with flexible port configuration and adds it to the model
     */
    addNodeWithPorts(config: ICreateNodeWithPorts): SprottyNode {
        const newNode = this.createNodeWithPorts(config);
        this.model.children.push(newNode);
        return newNode;
    }

    /**
     * Add a package node to the model
     * Package nodes can contain child nodes
     */
    addPackageNode(): void {
        const timestamp = Date.now();
        const packageId = `package-${timestamp}`;
        
        // Calculate position for the new package node
        const existingNodes = this.model.children.filter(
            child => child.type === 'node:package' || child.type === 'node:process' || child.type === 'node:svg'
        );
        
        let x = 100;
        let y = 100;
        
        if (existingNodes.length > 0) {
            // Place new package offset from the last node
            const lastNode = existingNodes[existingNodes.length - 1] as any;
            x = lastNode.position.x + 250;
            y = lastNode.position.y;
        }

        const newPackage = this.createPackageNode({
            id: packageId,
            x,
            y,
            name: 'New Package',
            size: { width: 400, height: 200 },
            children: [
                this.createNodeWithPorts({
                    id: 'child-node1',
                    x: 50,
                    y: 50,
                    name: 'Process A',
                    ports: [
                        { type: 'input', side: 'left', shape: 'circle', id: 'in' },
                        { type: 'output', side: 'right', shape: 'circle', id: 'out' },
                    ],
                    size: { width: 120, height: 60 }
                }),
                this.createNodeWithPorts({
                    id: 'child-node2',
                    x: 250,
                    y: 50,
                    name: 'Process B',
                    ports: [
                        { type: 'input', side: 'left', shape: 'circle', id: 'in' },
                        { type: 'output', side: 'right', shape: 'circle', id: 'out' },
                    ],
                    size: { width: 120, height: 60 }
                }),
            ]
        });

        this.model.children.push(newPackage);
    }

    private parseSvgInfo(svgContent: string, defaultWidth = 100, defaultHeight = 100): {
        width: number;
        height: number;
        rotation: number;
        cleanedSvgContent: string;
    } | null {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        
        if (!svg) {
            console.error('Invalid SVG content');
            return null;
        }
        
        // Get viewBox or width/height for sizing
        const viewBox = svg.getAttribute('viewBox');
        let width = defaultWidth;
        let height = defaultHeight;
        
        if (viewBox) {
            const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
            width = vbWidth || defaultWidth;
            height = vbHeight || defaultHeight;
        } else {
            width = parseFloat(svg.getAttribute('width') || String(defaultWidth));
            height = parseFloat(svg.getAttribute('height') || String(defaultHeight));
        }
        
        // Extract rotation information from SVG
        const { rotation } = this.parseTransformFromSvg(svgContent);

        // Remove only the transform attribute from <g> tags, keep the <g> tag itself
        const cleanedSvgContent = svgContent.replace(/<g\s+transform="[^"]*">/gi, '<g>');

        return { width, height, rotation, cleanedSvgContent };
    }

    importSvgNodes({
        svgContent, 
        fileName = '', 
        x = 100,
        y = 100,
        flipHorizontal = null,
        flipVertical = null
    }: IImportSvgNodes): void {
        const timestamp = Date.now();
        const nodeId = `svg-imported-${timestamp}`;
        
        // Parse SVG info with default dimensions
        const svgInfo = this.parseSvgInfo(svgContent, 200, 200);
        if (!svgInfo) return;

        // Get node name from filename or use a default
        const nodeName = fileName ? fileName.replace('.svg', '') : `Imported SVG ${timestamp}`;
        
        // Calculate position to place the new node (offset from existing nodes)
        const existingNodes = this.model.children.filter(
            child => child.type === 'node:svg' || child.type === 'node:process'
        ) as (SvgNode | SprottyNode)[];
        
        let _x = x;
        let _y = y;
        
        if (existingNodes.length > 0) {
            // Place new node offset from the last node
            const lastNode = existingNodes[existingNodes.length - 1];
            _x = lastNode.position.x + 250;
            _y = lastNode.position.y;
        }

        // Create the SVG node with extracted information
        this.addSvgNode({
            id: nodeId,
            x: _x,
            y: _y,
            name: nodeName,
            size: { width: svgInfo.width, height: svgInfo.height },
            svgContent: svgInfo.cleanedSvgContent,
            rotation: svgInfo.rotation,
            flipHorizontal,
            flipVertical
        });
    }

    updateNodePosition(nodeId: string, x: number, y: number): void {
        // Helper function to recursively search for node
        const findNode = (children: any[]): SprottyNode | SvgNode | PackageNode | undefined => {
            for (const child of children) {
                if ((child.type === 'node:process' || child.type === 'node:svg' || child.type === 'node:package') && 
                    child.id === nodeId) {
                    return child as SprottyNode | SvgNode | PackageNode;
                }
                
                // Recursively search in package node's children
                if (child.type === 'node:package' && child.children) {
                    const found = findNode(child.children);
                    if (found) return found;
                }
            }
            return undefined;
        };
        
        const node = findNode(this.model.children);
        
        if (node) {
            node.position.x = x;
            node.position.y = y;
        }
    }

    updateNodeSize(nodeId: string, width: number, height: number): void {
        // Helper function to recursively search for node
        const findNode = (children: any[]): SprottyNode | SvgNode | PackageNode | undefined => {
            for (const child of children) {
                if ((child.type === 'node:process' || child.type === 'node:svg' || child.type === 'node:package') && 
                    child.id === nodeId) {
                    return child as SprottyNode | SvgNode | PackageNode;
                }
                
                // Recursively search in package node's children
                if (child.type === 'node:package' && child.children) {
                    const found = findNode(child.children);
                    if (found) return found;
                }
            }
            return undefined;
        };
        
        const node = findNode(this.model.children);
        
        if (node && node.children) {
            const oldWidth = node.size.width;
            const oldHeight = node.size.height;
            
            // Update node size
            node.size.width = width;
            node.size.height = height;
            
            // Recalculate port positions based on new size
            // Count ports per side
            const portsPerSide: Record<PortSide, SprottyPort[]> = {
                left: [],
                right: [],
                top: [],
                bottom: []
            };
            
            node.children.forEach((child: any) => {
                if (child.type === 'port:flow') {
                    const port = child as SprottyPort;
                    const side = port.side as PortSide;
                    if (side) {
                        portsPerSide[side].push(port);
                    }
                }
            });
            
            // Update each port's position
            Object.entries(portsPerSide).forEach(([side, ports]) => {
                ports.forEach((port, index) => {
                    const newPosition = this.calculatePortPosition(
                        side as PortSide,
                        index,
                        ports.length,
                        { width, height }
                    );
                    port.position.x = newPosition.x;
                    port.position.y = newPosition.y;
                });
            });
        }
    }

    addEdge(sourcePortId: string, targetPortId: string): { success: boolean; message: string } {
        // Validate edge
        const validation = this.validateEdge(sourcePortId, targetPortId);
        if (!validation.valid) {
            return { success: false, message: validation.reason || 'Invalid edge' };
        }

        const edgeId = `edge-${++this.edgeCounter}`;
        const newEdge: SprottyEdge = {
            type: 'edge:flow',
            id: edgeId,
            sourceId: sourcePortId,
            targetId: targetPortId
        };
        
        this.model.children.push(newEdge);
        return { success: true, message: `Edge created: ${sourcePortId} → ${targetPortId}` };
    }

    private validateEdge(sourcePortId: string, targetPortId: string): { valid: boolean; reason?: string } {
        // Extract node IDs from port IDs (everything before the first port identifier)
        const sourceNodeId = this.extractNodeId(sourcePortId);
        const targetNodeId = this.extractNodeId(targetPortId);
        
        // Check if connecting to same node
        if (sourceNodeId === targetNodeId) {
            return { valid: false, reason: 'Cannot connect a node to itself' };
        }
        
        // Check if edge already exists
        const exists = this.model.children.some(child => 
            child.type === 'edge:flow' && 
            (child as SprottyEdge).sourceId === sourcePortId && 
            (child as SprottyEdge).targetId === targetPortId
        );
        
        if (exists) {
            return { valid: false, reason: 'Edge already exists' };
        }
        
        return { valid: true };
    }

    private extractNodeId(portId: string): string {
        // Find the node by checking if any node has a port with this ID
        for (const child of this.model.children) {
            if (child.type === 'node:process' || child.type === 'node:svg') {
                const node = child as SprottyNode | SvgNode;
                if (node.children.some(port => port.id === portId)) {
                    return node.id;
                }
            }
        }
        // Fallback: extract from ID format (first part before first hyphen followed by known patterns)
        const parts = portId.split('-');
        return parts[0];
    }
}
