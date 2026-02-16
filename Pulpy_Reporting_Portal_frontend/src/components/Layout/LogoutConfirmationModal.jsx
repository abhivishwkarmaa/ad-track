
import React from 'react';
import { createPortal } from 'react-dom';

const LogoutConfirmationModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">Confirm Logout</h3>
                    <button className="modal-close" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                </div>
                <div className="modal-body">
                    <p>Are you sure you want to logout?</p>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-danger" onClick={onConfirm}>Logout</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default LogoutConfirmationModal;
