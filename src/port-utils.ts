import { PortInfo, Position, ViewTransform } from "./types";

export function getViewTransform(): ViewTransform {
    const svg = document.querySelector('#sprotty-container svg') as SVGSVGElement;
    const innerGroup = svg?.querySelector('g') as SVGGElement;
    
    if (!innerGroup) {
        return { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, matrix: null };
    }
    
    // Get the transform attribute or computed transform
    const ctm = innerGroup.getCTM();
    
    let translateX = 0, translateY = 0, scaleX = 1, scaleY = 1;
    
    if (ctm) {
        translateX = ctm.e;
        translateY = ctm.f;
        scaleX = ctm.a;
        scaleY = ctm.d;
    }
    return { translateX, translateY, scaleX, scaleY, matrix: ctm };
}

/**
 * Log all node positions from the model
 */
export function logNodePositions(): void {
    const nodes = document.querySelectorAll('.sprotty-node');
    
    nodes.forEach((node, index) => {
        const id = node.getAttribute('id');
        const transform = node.getAttribute('transform');
        
        // Try to parse translate from transform
        let x = 0, y = 0;
        if (transform) {
            const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
            if (match) {
                x = parseFloat(match[1]);
                y = parseFloat(match[2]);
            }
        }
    });
}

/**
 * Log all port positions
 */
export function logPortPositions(): void {
    const ports = document.querySelectorAll('.sprotty-port');
    const svg = document.querySelector('#sprotty-container svg') as SVGSVGElement;
    
    console.log(`🔴🟢 [DEBUG] Found ${ports.length} ports in DOM:`);
    
    ports.forEach((port, index) => {
        const portElement = port as HTMLElement;
        const id = portElement.getAttribute('id');
        const isOutput = portElement.classList.contains('port-output');
        const icon = isOutput ? '🟢' : '🔴';
        
        // Get screen position
        const rect = portElement.getBoundingClientRect();
        const screenX = rect.left + rect.width / 2;
        const screenY = rect.top + rect.height / 2;
        
        // Get SVG position using our function
        const svgPos = getPortPosition(portElement);
        
        console.log(`  ${icon} [DEBUG] Port ${index + 1}: id="${id}" | Screen: (${screenX.toFixed(1)}, ${screenY.toFixed(1)}) | SVG: (${svgPos.x.toFixed(1)}, ${svgPos.y.toFixed(1)})`);
    });
}

/**
 * Find port information from a DOM element by traversing up the tree
 */
export function findPortInfo(element: Element | null): PortInfo | null {
    if (!element) return null;
    
    let current = element as HTMLElement | null;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (current && current !== document.body && attempts < maxAttempts) {
        attempts++;
        
        if (!current.classList) {
            current = current.parentElement;
            continue;
        }
        
        // Check if this is a port element
        if (current.classList.contains('sprotty-port')) {
            const id = current.getAttribute('id');
            
            // Extract port ID from Sprotty ID format
            let portId: string | null = null;
            if (id) {
                const patterns = [
                    /^sprotty-[^_]+_(.+)$/,
                    /^sprotty_[^_]+_(.+)$/,
                    /_([^_]+)$/
                ];
                
                for (const pattern of patterns) {
                    const match = id.match(pattern);
                    if (match) {
                        portId = match[1];
                        break;
                    }
                }
            }
            
            // Determine port type from ID suffix or CSS classes
            let portType: 'input' | 'output' | null = null;
            
            if (portId) {
                if (portId.endsWith('-in')) {
                    portType = 'input';
                } else if (portId.endsWith('-out')) {
                    portType = 'output';
                }
            }
            
            // Fallback to CSS classes
            if (!portType) {
                if (current.classList.contains('port-input')) {
                    portType = 'input';
                } else if (current.classList.contains('port-output')) {
                    portType = 'output';
                }
            }
            
            if (portType && portId) {
                return {
                    id: portId,
                    type: portType,
                    element: current
                };
            }
        }
        
        current = current.parentElement;
    }
    
    return null;
}

/**
 * Get the center position of a port element in SVG coordinates
 * IMPORTANT: This returns coordinates in the INNER GROUP's coordinate system
 * (after view transform is applied), which is where the feedback line is drawn
 */
export function getPortPosition(portElement: HTMLElement): Position {
    const svg = document.querySelector('#sprotty-container svg') as SVGSVGElement;
    const innerGroup = svg?.querySelector('g') as SVGGElement;
    
    if (!svg) {
        console.error('❌ [DEBUG] getPortPosition: SVG not found');
        return { x: 0, y: 0 };
    }
    
    try {
        // Get port center in screen coordinates
        const portRect = portElement.getBoundingClientRect();
        const screenX = portRect.left + portRect.width / 2;
        const screenY = portRect.top + portRect.height / 2;
        
        // Create SVG point for transformation
        const point = svg.createSVGPoint();
        point.x = screenX;
        point.y = screenY;
        
        // Get the CTM of the INNER GROUP (not the SVG root)
        // This accounts for pan/zoom transforms applied by Sprotty
        const ctm = innerGroup ? innerGroup.getScreenCTM() : svg.getScreenCTM();
        
        if (ctm) {
            const svgPoint = point.matrixTransform(ctm.inverse());
            
            console.log(`📌 [DEBUG] getPortPosition: Screen(${screenX.toFixed(1)}, ${screenY.toFixed(1)}) -> SVG(${svgPoint.x.toFixed(1)}, ${svgPoint.y.toFixed(1)})`);
            
            return {
                x: svgPoint.x,
                y: svgPoint.y
            };
        }
    } catch (error) {
        console.error('❌ [DEBUG] getPortPosition error:', error);
    }
    
    // Fallback: simple calculation (won't account for transforms properly)
    const svgRect = svg.getBoundingClientRect();
    const portRect = portElement.getBoundingClientRect();
    const fallbackX = portRect.left - svgRect.left + portRect.width / 2;
    const fallbackY = portRect.top - svgRect.top + portRect.height / 2;
    
    console.warn(`⚠️ [DEBUG] getPortPosition: Using fallback calculation: (${fallbackX.toFixed(1)}, ${fallbackY.toFixed(1)})`);
    
    return {
        x: fallbackX,
        y: fallbackY
    };
}

/**
 * Get mouse position in SVG coordinates (in the inner group's coordinate system)
 */
export function getSvgMousePosition(event: MouseEvent, svg: SVGSVGElement): Position {
    const innerGroup = svg.querySelector('g') as SVGGElement;
    
    try {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        
        // Use the inner group's CTM to account for pan/zoom
        const ctm = innerGroup ? innerGroup.getScreenCTM() : svg.getScreenCTM();
        
        if (ctm) {
            const svgPoint = point.matrixTransform(ctm.inverse());
            return { x: svgPoint.x, y: svgPoint.y };
        }
    } catch (error) {
        console.error('❌ [DEBUG] getSvgMousePosition error:', error);
    }
    
    // Fallback
    const svgRect = svg.getBoundingClientRect();
    return {
        x: event.clientX - svgRect.left,
        y: event.clientY - svgRect.top
    };
}

/**
 * Debug helper: Log all coordinate information
 */
export function debugCoordinates(): void {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 [DEBUG] COORDINATE SYSTEM DEBUG INFO');
    console.log('═══════════════════════════════════════════════════════');
    
    getViewTransform();
    logNodePositions();
    logPortPositions();
    
    console.log('═══════════════════════════════════════════════════════');
}
