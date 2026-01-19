import { SNodeImpl } from "sprotty";

export interface PortInfo {
    id: string;
    type: 'input' | 'output';
    element: HTMLElement;
}

export interface Position {
    x: number;
    y: number;
}

export interface ViewTransform {
    translateX: number;
    translateY: number;
    scaleX: number;
    scaleY: number;
    matrix: DOMMatrix | null;
}

export class SvgNodeImpl extends SNodeImpl {
    svgContent?: string;
    rotation: number = 0;
}

export type PortShape = 'circle' | 'square' | 'diamond' | 'triangle';

export type PortSide = 'left' | 'right' | 'top' | 'bottom';

export interface PortConfig {
    id?: string;                    // Optional custom ID suffix
    type: 'input' | 'output';       // Port direction
    side: PortSide;                 // Which side of the node
    index?: number;                 // Position index on the side (0-based)
    shape?: PortShape;              // Visual shape (default: circle)
    label?: string;                 // Optional label for the port
}

export interface SprottyNode {
    type: string;
    id: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    name: string;
    children: SprottyPort[];
    flipHorizontal?: number | null; 
    flipVertical?: number | null; 
    enableFlipHorizontal?: boolean; 
    enableFlipVertical?: boolean;
    rotation?: number;
}

export interface PackageNode {
    type: 'node:package';
    id: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    name: string;
    children: Array<SprottyNode | SvgNode | SprottyPort>;
    rotation?: number;
}

export interface SvgNode extends Omit<SprottyNode, 'children'> {
    type: 'node:svg';
    children: SprottyPort[];
    svgContent?: string;
    rotation?: number; 
    flipHorizontal?: number | null;
    flipVertical?: number | null; 
    enableFlipHorizontal?: boolean; 
    enableFlipVertical?: boolean; 
}

export interface SprottySvgNode {
    id: string;
    x: number;
    y: number;
    name: string;
    size?: { width: number; height: number };
    svgContent?: string; 
    rotation?: number;
    flipHorizontal?: number | null; 
    flipVertical?: number | null;
    enableFlipHorizontal?: boolean; 
    enableFlipVertical?: boolean; 
}

export interface SprottyPort {
    type: string;
    id: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    portType: 'input' | 'output';
    shape: PortShape;              
    side: PortSide;                
    label?: string;                
}

export interface SprottyEdge {
    type: string;
    id: string;
    sourceId: string;
    targetId: string;
}

export interface SprottyGraph {
    type: string;
    id: string;
    children: Array<SprottyNode | SvgNode | SprottyEdge | PackageNode>;
}

export interface NodeSize {
    width: number;
    height: number;
}

export interface ICreateNode {
    id: string;
    x: number;
    y: number;
    name: string;
    ports: Array<'in' | 'out'>;
    size?: NodeSize;
    flipHorizontal?: number | null;
    flipVertical?: number | null;
    rotation?: number;
}

export interface ICreateNodeWithPorts {
    id: string;
    x: number;
    y: number;
    name: string;
    ports: PortConfig[];
    size: NodeSize;
    flipHorizontal?: number | null;
    flipVertical?: number | null;
    rotation?: number;
}

export interface IImportSvgNodes {
    svgContent: string;
    fileName?: string;
    title?: string;
    x?: number;
    y?: number;
    flipHorizontal?: number | null;
    flipVertical?: number | null;
    imgPath?: string;
}

export interface ISvgNodeLibarary {
    id: string;
    title: string;
    imgPath: string;
    svgContent: string;
}