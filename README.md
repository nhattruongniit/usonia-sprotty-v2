# Sprotty-2: Minimal Interactive Graph Editor

> **For Future LLMs/AI Assistants:** This README contains essential context about this project. Read this first before making changes.

## Table of Contents
- [Project Overview](#project-overview)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Architecture & Key Concepts](#architecture--key-concepts)
- [Features Implemented](#features-implemented)
- [Debug System](#debug-system)
- [Bug Fix: Coordinate Transformation](#bug-fix-coordinate-transformation)
- [Development History](#development-history)
- [Known Issues & Future Work](#known-issues--future-work)
- [For Future LLMs](#for-future-llms)

---

## Project Overview

**Sprotty-2** is a **minimal implementation** of an interactive graph editor using the [Sprotty](https://github.com/eclipse/sprotty) framework. It was created by stripping down the more complex `Sprotty` folder in the same workspace.

### Key Purpose
- Display nodes with input/output ports
- Allow interactive edge drawing by dragging from output ports to input ports
- Serve as a clean, minimal starting point for Sprotty-based graph applications

### Relationship to Original Sprotty Folder
```
/config/workspace/
├── Sprotty/          # Original, more complex implementation
│   ├── UI controls (buttons)
│   ├── Context menu
│   ├── Grid system
│   ├── Node alignment
│   ├── Multiple edge routing styles
│   └── Delete handlers
│
└── Sprotty-2/        # THIS PROJECT - minimal version
    ├── No UI controls
    ├── No buttons
    ├── No context menu
    ├── Just nodes, ports, edges
    └── Interactive edge drawing only
```
## Tech stack
- https://prebuiltui.com/

---

## Quick Start

```bash
# Install dependencies
npm install

# Run development server (with hot reload)
npm run dev
# Server runs at http://127.0.0.1:8090/

# Build production
npm run build
```

---

## Project Structure

```
Sprotty-2/
├── build.js           # esbuild configuration (bundler)
├── index.html         # Minimal HTML - just a container div
├── package.json       # Dependencies: esbuild, sprotty, typescript
├── tsconfig.json      # TypeScript config with decorators enabled
├── dist/              # Built output (generated)
│   ├── bundle.js
│   └── bundle.js.map
└── src/
    ├── global.d.ts    # TypeScript declaration for CSS imports
    ├── index.ts       # Main entry point - app initialization
    ├── model.ts       # Graph model (nodes, ports, edges)
    ├── views.ts       # SVG rendering views for each element type
    ├── edge-creator.ts# Interactive edge drawing logic
    ├── port-utils.ts  # Port detection & coordinate transformation
    └── styles.css     # Visual styling for nodes, ports, edges
```

### File Responsibilities

| File | Purpose |
|------|---------|
| `index.ts` | Creates Sprotty container, configures DI, initializes app |
| `model.ts` | Defines graph data structure, creates initial nodes, validates edges |
| `views.ts` | Renders nodes as rectangles, ports as circles, edges as bezier paths |
| `edge-creator.ts` | Handles mousedown/move/up for dragging edges between ports |
| `port-utils.ts` | **CRITICAL:** Converts screen coordinates to SVG coordinates |
| `styles.css` | CSS for dark theme, node colors, port colors (green=output, orange=input) |

---

## Architecture & Key Concepts

### Sprotty Framework Basics
Sprotty uses:
- **Inversify** for dependency injection
- **Model-View pattern**: Data model → Views render SVG
- **LocalModelSource**: Holds the graph model, triggers re-renders

### Element Types
```typescript
// Configured in index.ts
'graph'        → SGraphImpl   → SGraphView       // Root container
'node:process' → SNodeImpl    → ProcessNodeView  // Rectangle with label
'port:flow'    → SPortImpl    → FlowPortView     // Circle (input/output)
'edge:flow'    → SEdgeImpl    → FlowEdgeView     // Bezier curve
```

### Initial Graph Model
```
[Source] ──→ [Process A] ──→ [Output]
             [Process B]
```
- 4 nodes with various port configurations
- 2 initial demo edges

---

## Features Implemented

### ✅ Nodes
- Rectangular shape with rounded corners
- Label centered inside
- Draggable (via Sprotty's built-in move tool)
- Configurable size per node

### ✅ Ports - Multi-Port & Different Shapes
- **Multiple ports per side**: Configure any number of input/output ports on each side
- **Ports on all sides**: Left, right, top, and bottom port placement
- **Four port shapes**:
  - ● **Circle** - Standard data flow port (default)
  - ■ **Square** - Configuration/parameter port
  - ◆ **Diamond** - Event/signal port
  - ▲ **Triangle** - Directional flow (points inward for input, outward for output)
- **Color coding**:
  - 🟢 **Green** (output) - Data flows OUT of the node
  - 🟠 **Orange** (input) - Data flows INTO the node
  - 🟣 **Purple** - Valid drop target highlight
- Visual highlighting on hover with glow effects
- Automatic port distribution along each side

### ✅ Port Configuration API
```typescript
// Example: Creating a node with multiple ports
createNodeWithPorts('nodeId', x, y, 'Node Name', [
    { type: 'input', side: 'left', shape: 'circle', id: 'in1' },
    { type: 'input', side: 'left', shape: 'square', id: 'in2' },
    { type: 'output', side: 'right', shape: 'diamond', id: 'out1' },
    { type: 'input', side: 'top', shape: 'triangle', id: 'top-in' },
    { type: 'output', side: 'bottom', shape: 'triangle', id: 'bottom-out' },
], { width: 140, height: 80 });
```

### ✅ Interactive Edge Drawing
1. Click and drag from a **green output port**
2. An **orthogonal** (right-angle) feedback line follows your mouse
3. Valid input ports highlight in purple
4. Release on an **orange input port** to create edge
5. Press Escape to cancel

### ✅ Edge Rendering - Orthogonal (Manhattan) Routing
- **Orthogonal paths** (draw.io style) - edges travel in right angles only:
  ```
  Source ──────┐
               │
               └────── Target
  ```
- Path goes: horizontal → vertical → horizontal
- Stroke color: indigo/purple

---

### During Edge Creation
Console logs automatically show:
- Source port ID and position
- Mouse coordinates (screen and SVG)
- View transform at start and end
- Target port when dropped

### During Rendering
Views log position information when elements are rendered:
```
📍 [RENDER] Node "Source" (node1) at position: x=50.0, y=100.0
🟢 [RENDER] Port "node1-out" (output) at local position: x=112.0, y=22.0
🔗 [RENDER] Edge "edge-demo-1": Start(170.0, 130.0) -> End(350.0, 80.0)
```

---
### Development Workflow

1. **Always branch from `minimal`** for new features:
   ```bash
   git checkout minimal
   git checkout -b feature/your-feature-name
   ```

2. **Develop and commit your feature** on the feature branch

3. **Push feature branch** to GitHub:
   ```bash
   git push -u origin feature/your-feature-name
   ```

4. **When ready to integrate**, merge feature into main:
   ```bash
   git checkout main
   git merge feature/your-feature-name
   git push origin main
   ```

5. **Keep minimal branch clean** - never commit directly to it

### Completed Features
- [x] `feature/orthogonal-edges` - Manhattan-style edge routing
- [x] `feature/multi-ports-shapes` - Multiple ports per node with different shapes

### Planned Features (as separate branches)
- [ ] `feature/multi-select-nodes` - Ctrl+Click to select multiple nodes
- [ ] `feature/multi-select-edges` - Ctrl+Click to select multiple edges  
- [ ] `feature/delete-elements` - Delete selected nodes/edges
- [ ] `feature/add-nodes` - Add new nodes dynamically
- [ ] `feature/edge-routing-styles` - Straight, orthogonal, bezier options
- [ ] `feature/zoom-controls` - Zoom in/out/fit
- [ ] `feature/export-import` - JSON export/import of graph

---

## Known Issues & Future Work

### Known Issues
1. **Verbose console logging**: Currently logs on every render - may want to add a debug flag
2. **No edge deletion**: Can create edges but cannot delete them
3. **No node addition/deletion**: Static set of nodes

### Potential Future Features
- [ ] Toggle debug logging on/off
- [ ] Delete edges (click to select, press Delete)
- [ ] Delete nodes
- [ ] Add new nodes
- [ ] Multiple edge routing styles (straight, orthogonal)
- [ ] Zoom controls
- [ ] Export/import graph model as JSON
- [ ] Node resizing
- [x] Multiple ports per side ✅ (Completed in feature/multi-ports-shapes)
- [x] Different port shapes ✅ (Completed in feature/multi-ports-shapes)

---

## For Future LLMs (Claude Opus/Sonnet via Cline)

> **IMPORTANT:** This section is specifically for AI assistants starting a new task/session on this project.

### 🚀 Quick Start for New AI Session

When you start a new Cline task on this project, follow these steps:

1. **Read this README.md first** - It contains all context you need
2. **Check current branch**: `git branch` - Know where you are
3. **Check for uncommitted changes**: `git status`
4. **Pull latest changes**: `git pull origin main`

### 📋 GitHub Workflow Checklist for AI Development

#### Starting a New Feature:
```bash
# 1. Ensure you're on minimal branch
cd /config/workspace/Sprotty-2
git checkout minimal
git pull origin minimal

# 2. Create new feature branch
git checkout -b feature/your-feature-name

# 3. Make changes to code...

# 4. Test the build
npm run build

# 5. Commit changes
git add .
git commit -m "feat: Description of what you added"

# 6. Push feature branch to GitHub
git push -u origin feature/your-feature-name
```

#### Merging a Feature to Main:
```bash
# 1. Switch to main
git checkout main
git pull origin main

# 2. Merge feature branch
git merge feature/your-feature-name

# 3. Push updated main
git push origin main

# 4. Update README with completed feature if needed
```

### 📝 Commit Message Convention
Use these prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `style:` - CSS/styling changes
- `refactor:` - Code restructuring
- `debug:` - Debug logging changes

### 🎯 Feature Implementation Guide

When user asks to implement a new feature:

1. **Ask which approach**:
   - Option A: Create new feature branch (recommended)
   - Option B: Work directly on main (quick fixes only)

2. **For new feature branch**:
   - Branch from `minimal` (not main!)
   - Use naming: `feature/descriptive-name`
   - One feature per branch

3. **Update README.md**:
   - Mark feature as completed in "Planned Features" section
   - Add to "Development History" section
   - Document any new files created

### 🔍 Key Files to Read First
1. **This README.md** - You're here!
2. **`src/port-utils.ts`** - Critical coordinate transformation logic
3. **`src/edge-creator.ts`** - Edge drawing interaction
4. **`src/model.ts`** - Graph data structure
5. **`src/views.ts`** - How things are rendered

### Common Tasks

**To add a new node type:**
1. Define type in `model.ts` (interface + create function)
2. Create view in `views.ts` (implement `IView`)
3. Register in `index.ts` (`configureModelElement`)

**To modify edge appearance:**
- Edit `FlowEdgeView` in `views.ts`
- Edit `.sprotty-edge` styles in `styles.css`

**To change port colors:**
- Edit `.port-input` and `.port-output` in `styles.css`

**To debug coordinate issues:**
1. Press "D" to dump all coordinates
2. Check view transform values
3. Compare screen vs SVG coordinates
4. Ensure using `innerGroup.getScreenCTM()` not `svg.getScreenCTM()`

### ⚠️ Critical Warning
**ALWAYS use the inner group's CTM for coordinate transformations!**
```typescript
// ❌ WRONG - will break after panning
const ctm = svg.getScreenCTM();

// ✅ CORRECT - accounts for pan/zoom
const innerGroup = svg.querySelector('g');
const ctm = innerGroup.getScreenCTM();
```

---

## Dependencies

```json
{
  "devDependencies": {
    "esbuild": "^0.27.0",
    "sprotty": "^1.4.0",
    "typescript": "^5.9.3"
  }
}
```

Sprotty transitively includes:
- `inversify` (dependency injection)
- `snabbdom` (virtual DOM for SVG)

---

## License

ISC

---

*Last updated: December 4, 2025 by Claude (Anthropic) via Cline*
