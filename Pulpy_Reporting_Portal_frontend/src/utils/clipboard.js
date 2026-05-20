/**
 * Normalize text for cross-app clipboard paste (WhatsApp, Teams, Notes, etc.)
 * - Strip invisible Unicode characters
 * - Use CRLF line endings (required by some desktop chat apps)
 */
const normalizeClipboardText = (text) =>
    String(text)
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\r?\n/g, '\r\n');

/**
 * Safe clipboard copy function with fallback for environments where
 * navigator.clipboard is not available (e.g., non-HTTPS, older browsers).
 * Uses explicit text/plain MIME type for compatibility with WhatsApp and Teams.
 */
export const copyToClipboard = async (text) => {
    if (!text) {
        return { success: false, error: 'No text to copy' };
    }

    const normalized = normalizeClipboardText(text);

    // ClipboardItem with explicit text/plain — most reliable for WhatsApp/Teams desktop
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/plain': new Blob([normalized], { type: 'text/plain' }),
                }),
            ]);
            return { success: true };
        } catch (err) {
            console.warn('ClipboardItem write failed, trying writeText:', err);
        }
    }

    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(normalized);
            return { success: true };
        } catch (err) {
            console.warn('Clipboard API failed, trying fallback:', err);
        }
    }

    // execCommand fallback for non-HTTPS or unsupported browsers
    try {
        const textarea = document.createElement('textarea');
        textarea.value = normalized;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, normalized.length);

        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (successful) {
            return { success: true };
        }
        return { success: false, error: 'Copy command failed' };
    } catch (err) {
        console.error('Fallback copy method failed:', err);
        return { success: false, error: err.message || 'Failed to copy to clipboard' };
    }
};

