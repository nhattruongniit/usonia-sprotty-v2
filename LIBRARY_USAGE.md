# Sprotty Diagram Library - Usage Guide

## Installation

### From npm
```bash
npm install @usonialab/sprotty-diagram
```

### From CDN
```html
<script src="https://unpkg.com/@usonialab/sprotty-diagram/dist/sprotty.min.js"></script>
```

## Basic Usage

### Simple HTML

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Diagram</title>
</head>
<body>
    <div id="sprotty-container" style="width: 100%; height: 600px;"></div>
    <script src="https://unpkg.com/@usonialab/sprotty-diagram/dist/sprotty.min.js"></script>
    <script>
        window.addEventListener('load', async () => {
            try {
                // Initialize Sprotty
                sprottyInstance = new Sprotty({
                    containerId: 'sprotty-container',
                    initialModel: {
                        type: 'graph',
                        id: 'graph',
                        children: []
                    }
                });
                
                await sprottyInstance.init();
                console.log('Sprotty initialized successfully!');
            } catch (error) {
                console.error('Failed to initialize Sprotty:', error);
            }
        });
    </script>
</body>
</html>
```

## API

### Constructor

```javascript
const sprotty = new Sprotty(options);
```

**Options:**
- `containerId` (string, optional): ID of the container element. Default: `'sprotty-container'`
- `initialModel` (object, optional): Initial model to load

### Methods

#### `init(): Promise<void>`
Initialize the Sprotty diagram. This method must be called after the DOM is ready.

```javascript
await sprotty.init();
```

#### `getModel(): object`
Get the current diagram model.

```javascript
const model = sprotty.getModel();
console.log(model);
```

#### `loadModel(model: object): void`
Load a new model into the diagram.

```javascript
const newModel = {
    type: 'graph',
    id: 'graph',
    children: [
        // ... nodes and edges
    ]
};
sprotty.loadModel(newModel);
```

#### `createNodeWithPorts(config: ICreateNodeWithPorts): SprottyNode`
Create a node with ports and add it to the diagram.

```javascript
const node = sprotty.createNodeWithPorts({
    id: 'node1',
    x: 100,
    y: 100,
    name: 'My Node',
    size: { width: 150, height: 80 },
    ports: [
        { type: 'input', side: 'left', shape: 'circle', id: 'in1' },
        { type: 'input', side: 'left', shape: 'square', id: 'in2' },
        { type: 'output', side: 'right', shape: 'circle', id: 'out1' },
        { type: 'output', side: 'right', shape: 'triangle', id: 'out2' },
        { type: 'input', side: 'top', shape: 'diamond', id: 'top-in' },
        { type: 'output', side: 'bottom', shape: 'circle', id: 'bottom-out' }
    ]
});
```

**Parameters:**
- `id` (string): Unique ID for the node
- `x` (number): X position
- `y` (number): Y position
- `name` (string): Display name of the node
- `size` (object): `{ width: number, height: number }`
- `ports` (array): Array of port configurations
  - `type`: `'input'` or `'output'`
  - `side`: `'left'`, `'right'`, `'top'`, or `'bottom'`
  - `shape`: `'circle'`, `'square'`, `'triangle'`, or `'diamond'` (optional, default: `'circle'`)
  - `id` (string, optional): ID for the port (will be auto-generated if not provided)
  - `label` (string, optional): Display label for the port
- `flipHorizontal` (number | null, optional): Flip node horizontally
- `flipVertical` (number | null, optional): Flip node vertically
- `rotation` (number, optional): Rotation angle (degrees)

#### `destroy(): void`
Destroy the instance and cleanup resources.

```javascript
sprotty.destroy();
```


## Model Examples

```javascript
const model = {
    "type": "graph",
    "id": "root",
    "children": [
        {
            "type": "node:process",
            "id": "node-1768746343480",
            "position": {
                "x": 251,
                "y": 291
            },
            "size": {
                "width": 120,
                "height": 60
            },
            "name": "Default Node",
            "children": [
                {
                    "type": "port:flow",
                    "id": "node-1768746343480-in",
                    "position": {
                        "x": -8,
                        "y": 22
                    },
                    "size": {
                        "width": 16,
                        "height": 16
                    },
                    "portType": "input",
                    "shape": "circle",
                    "side": "left"
                },
                    {
                    "type": "port:flow",
                    "id": "node-1768746343480-out",
                    "position": {
                        "x": 112,
                        "y": 22
                    },
                    "size": {
                        "width": 16,
                        "height": 16
                    },
                    "portType": "output",
                    "shape": "circle",
                    "side": "right"
                }
            ],
            "flipHorizontal": null,
            "flipVertical": null,
            "rotation": 0
        },
        {
            "type": "node:process",
            "id": "node-1768747243406",
            "position": {
                "x": 526,
                "y": 179
            },
            "size": {
                "width": 120,
                "height": 60
            },
            "name": "Default Node",
            "children": [
                {
                    "type": "port:flow",
                    "id": "node-1768747243406-in",
                    "position": {
                        "x": -8,
                        "y": 22
                    },
                    "size": {
                        "width": 16,
                        "height": 16
                    },
                    "portType": "input",
                    "shape": "circle",
                    "side": "left"
                },
                {
                    "type": "port:flow",
                    "id": "node-1768747243406-out",
                    "position": {
                        "x": 112,
                        "y": 22
                    },
                    "size": {
                        "width": 16,
                        "height": 16
                    },
                    "portType": "output",
                    "shape": "circle",
                    "side": "right"
                }
            ],
            "flipHorizontal": null,
            "flipVertical": null,
            "rotation": 0
        },
        {
            "type": "edge:flow",
            "id": "edge-1",
            "sourceId": "node-1768746343480-out",
            "targetId": "node-1768747243406-in"
        }
    ]
};
```

# Publishing Guide
Notes: If you want to publish new api or change existing api, please also update the `lib.ts` file.

## Summary of What Has Been Set Up

1. ✅ **Library Entry Point**: `src/lib.ts` - Exports the `Sprotty` class for library usage
2. ✅ **Build Script**: `build.js` - Supports library bundle build with `--lib` flag
3. ✅ **Package.json**: Fully configured for npm publishing
4. ✅ **Bundle Files**: 
   - `dist/sprotty.js` - Development bundle (with sourcemap)
   - `dist/sprotty.min.js` - Production bundle (minified)
5. ✅ **Example**: `example.html` - Example file demonstrating library usage

## Steps to Publish

### 1. Build library bundle
```bash
npm run build:lib
```

### 2. Check files to be published
```bash
npm pack --dry-run
```

This command will display the list of files that will be packaged.

### 3. Test bundle locally
Open the `example.html` file in a browser to test:
```bash
# Use a local server
python3 -m http.server 8000
# Or
npx serve .
```

Then open: `http://localhost:8000/example.html`

### 4. Login to npm
```bash
npm login

# set token
npm config set //registry.npmjs.org/:_authToken=YOUR_TOKEN_HERE
```

Enter your npm account username, password, and email.

### 5. Publish package
```bash
npm publish --access public
```

**Note**: Since the package name is `@usonialab/sprotty-diagram` (a scoped package), you need to add the `--access public` flag to publish publicly.

### 6. Verify on npm
After successful publishing, check at:
- https://www.npmjs.com/package/@usonialab/sprotty-diagram

## Usage After Publishing

### From npm
```bash
npm install @usonialab/sprotty-diagram
```

### From CDN (unpkg)
```html
<script src="https://unpkg.com/@usonialab/sprotty-diagram/dist/sprotty.min.js"></script>
```

### From CDN (jsDelivr)
```html
<script src="https://cdn.jsdelivr.net/npm/@usonialab/sprotty-diagram/dist/sprotty.min.js"></script>
```

## Version Updates

When you need to publish a new version:

1. Update version in `package.json`:
```bash
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
```

Or edit directly in `package.json`:
```json
{
  "version": "1.0.1"
}
```

2. Rebuild:
```bash
npm run build:lib
```

3. Publish:
```bash
npm publish --access public
```

## Package Structure After Publishing

```
@usonialab/sprotty-diagram/
├── dist/
│   ├── sprotty.js
│   ├── sprotty.min.js
│   └── sprotty.js.map
├── src/
│   └── lib.ts
├── package.json
└── README.md
```