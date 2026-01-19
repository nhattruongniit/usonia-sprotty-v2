export function displayContextMenu(event: MouseEvent, type: string) {
  const contextMenuEls = document.getElementsByClassName('context-menu');

  if (contextMenuEls && contextMenuEls.length > 0) {
    Array.from(contextMenuEls).forEach((e) => {
      (e as HTMLElement).style.display = 'none';
    });
  }
  const contextMenu = document.getElementById(`context-menu-${type}`);
  if (contextMenu) {
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.display = 'block';
  }
}
