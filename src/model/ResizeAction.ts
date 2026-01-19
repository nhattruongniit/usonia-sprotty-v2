import { Action, Bounds } from 'sprotty-protocol';

export interface ResizeAction extends Action {
  kind: typeof ResizeAction.KIND;
  nodeId: string;
  newBounds: Bounds;
}

export namespace ResizeAction {
  export const KIND = 'resize';

  export function create(options: { nodeId: string; newBounds: Bounds }): ResizeAction {
    return {
      kind: KIND,
      nodeId: options.nodeId,
      newBounds: options.newBounds,
    };
  }
}
