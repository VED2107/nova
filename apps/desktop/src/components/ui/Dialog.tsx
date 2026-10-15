import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "../icons";
import { Button, IconButton } from "./controls";

/**
 * Native modal <dialog>: the browser provides focus trapping, Esc to close,
 * inert background and focus return. Used only where focus must be protected
 * (settings, shortcuts, destructive confirmation).
 */
export function Dialog(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  description?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  return (
    <dialog
      ref={ref}
      aria-label={props.title}
      onClose={props.onClose}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) props.onClose(); // click on backdrop
      }}
      style={{ width: props.width ?? "min(560px, calc(100vw - 48px))" }}
      className="m-auto max-h-[min(720px,calc(100vh-48px))] overflow-hidden rounded-[12px] border border-seam-strong bg-paper p-0 text-ink shadow-[0_24px_64px_-16px_rgb(0_0_0/0.45)] open:flex open:flex-col"
    >
      <header className="flex items-start justify-between gap-4 border-b border-seam px-5 pb-3.5 pt-4">
        <div>
          <h2 className="spine text-[22px] text-ink">{props.title}</h2>
          {props.description && <p className="mt-1 text-[13px] text-ink-3">{props.description}</p>}
        </div>
        <IconButton label="Close" onClick={props.onClose} size="sm">
          <CloseIcon size={18} />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
      {props.footer && <footer className="flex justify-end gap-2 border-t border-seam px-5 py-3">{props.footer}</footer>}
    </dialog>
  );
}

/** Confirmation for destructive actions: the destructive button is isolated on the left. */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onCancel}
      title={props.title}
      width="min(440px, calc(100vw - 48px))"
      footer={
        <>
          <Button variant="danger" onClick={props.onConfirm}>
            {props.confirmLabel}
          </Button>
          <span className="flex-1" />
          <Button variant="primary" autoFocus onClick={props.onCancel}>
            Keep
          </Button>
        </>
      }
    >
      <div className="px-5 py-4 text-[14px] leading-relaxed text-ink-2">{props.body}</div>
    </Dialog>
  );
}
