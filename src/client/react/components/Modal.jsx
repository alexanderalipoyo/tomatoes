import { useEffect, useRef } from "react";
export function Modal({
  children,
  onClose,
  labelledBy,
  id,
  busy = false,
  className = "",
}) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    const close = () => onClose();
    window.addEventListener("hashchange", close);
    return () => {
      window.removeEventListener("hashchange", close);
      node.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      id={id}
      className={className}
      aria-labelledby={labelledBy}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target !== dialog.current || busy) return;
        const bounds = dialog.current.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      {children}
    </dialog>
  );
}
