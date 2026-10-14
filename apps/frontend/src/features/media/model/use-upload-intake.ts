import { useEffect, useState } from 'react';
import { pastedFiles } from './use-library-upload';

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true;

function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  );
}

/** Page-wide drag & drop and Ctrl/Cmd+V of images. Returns whether a file is being dragged over the page. */
export function useUploadIntake(onFiles: (files: File[]) => void, enabled: boolean): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      // Without preventDefault the browser would open the dropped file instead.
      if (hasFiles(event)) event.preventDefault();
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) onFiles(files);
    };
    const paste = (event: ClipboardEvent) => {
      if (isTextTarget(event.target)) return;
      const files = pastedFiles([...(event.clipboardData?.files ?? [])]);
      if (!files.length) return;
      event.preventDefault();
      onFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    document.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      document.removeEventListener('paste', paste);
    };
  }, [onFiles, enabled]);

  return dragging;
}
