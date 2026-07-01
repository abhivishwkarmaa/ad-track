import { AlertIcon } from './icons';

/**
 * Reusable confirmation dialog. Uses global modal styles from index.css.
 */
export default function ConfirmModal({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmVariant = 'danger',
    loading = false,
    variant = 'delete',
}) {
    if (!open) return null;

    const confirmClass = confirmVariant === 'primary' ? 'btn btn-primary' : 'btn btn-danger';

    return (
        <div className="modal-overlay" onClick={() => !loading && onClose()}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-body">
                    {variant === 'delete' ? (
                        <div className="delete-modal">
                            <div className="delete-modal-icon">
                                <AlertIcon />
                            </div>
                            <h3>{title}</h3>
                            <p>{message}</p>
                            <div className="delete-modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={onClose}
                                    disabled={loading}
                                >
                                    {cancelText}
                                </button>
                                <button
                                    type="button"
                                    className={confirmClass}
                                    onClick={onConfirm}
                                    disabled={loading}
                                >
                                    {loading ? 'Please wait...' : confirmText}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="confirm-modal-simple">
                            <h3>{title}</h3>
                            <p>{message}</p>
                            <div className="delete-modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={onClose}
                                    disabled={loading}
                                >
                                    {cancelText}
                                </button>
                                <button
                                    type="button"
                                    className={confirmClass}
                                    onClick={onConfirm}
                                    disabled={loading}
                                >
                                    {loading ? 'Please wait...' : confirmText}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
