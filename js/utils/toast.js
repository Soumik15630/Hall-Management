// js/utils/toast.js
// A centralized, reusable module for creating beautiful, non-blocking toast notifications and confirmation modals.

(function(window) {
    'use strict';

    // Ensures CSS is injected only once
    let stylesInjected = false;

    function injectToastStyles() {
        if (stylesInjected) return;
        const style = document.createElement('style');
        style.textContent = `
            #toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 10px;
            }
            .toast {
                display: flex;
                align-items: center;
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.1);
                background-color: #1e293b;
                color: #e2e8f0;
                min-width: 280px;
                max-width: 350px;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.4s cubic-bezier(0.21, 1.02, 0.73, 1);
            }
            .toast.show {
                opacity: 1;
                transform: translateX(0);
            }
            .toast-icon {
                margin-right: 12px;
                flex-shrink: 0;
            }
            .toast-icon svg {
                width: 20px;
                height: 20px;
            }
            .toast-message {
                flex-grow: 1;
                font-size: 14px;
                line-height: 1.4;
            }
            .toast-close-btn {
                background: none;
                border: none;
                color: #94a3b8;
                font-size: 20px;
                line-height: 1;
                cursor: pointer;
                margin-left: 16px;
                padding: 0 4px;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            .toast-close-btn:hover {
                opacity: 1;
            }

            /* Toast Types */
            .toast-success { background-color: #166534; border-left: 4px solid #4ade80; }
            .toast-success .toast-icon { color: #4ade80; }

            .toast-error { background-color: #9f1239; border-left: 4px solid #fb7185; }
            .toast-error .toast-icon { color: #fb7185; }

            .toast-warning { background-color: #92400e; border-left: 4px solid #fcd34d; }
            .toast-warning .toast-icon { color: #fcd34d; }

            .toast-info { background-color: #1e3a8a; border-left: 4px solid #93c5fd; }
            .toast-info .toast-icon { color: #93c5fd; }
        `;
        document.head.appendChild(style);
        stylesInjected = true;
    }

    function createToastContainer() {
        if (document.getElementById('toast-container')) return;
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    /**
     * Displays a toast notification.
     * @param {string} message - The message to display.
     * @param {string} [type='info'] - The type of toast ('success', 'error', 'warning', 'info').
     * @param {number} [duration=4000] - The duration in milliseconds for the toast to be visible.
     */
    function showToast(message, type = 'info', duration = 4000) {
        injectToastStyles();
        createToastContainer();
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: 'check-circle',
            error: 'x-circle',
            warning: 'alert-triangle',
            info: 'info'
        };

        toast.innerHTML = `
            <div class="toast-icon"><i data-lucide="${icons[type] || 'info'}"></i></div>
            <div class="toast-message">${message}</div>
            <button class="toast-close-btn">&times;</button>
        `;

        container.appendChild(toast);
        if (window.lucide) {
            lucide.createIcons();
        }

        // Animate in
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        const removeToast = () => {
            toast.classList.remove('show');
            // Wait for animation to finish before removing
            toast.addEventListener('transitionend', () => {
                if(toast.parentElement) {
                    toast.remove();
                }
            }, { once: true });
        };

        toast.querySelector('.toast-close-btn').addEventListener('click', removeToast);

        setTimeout(removeToast, duration);
    }

    /**
     * Displays a confirmation modal.
     * @param {string} title - The title of the confirmation dialog.
     * @param {string} message - The message/question to ask the user.
     * @param {function} onConfirm - The callback function to execute if the user confirms.
     * @param {object} [options] - Optional settings.
     * @param {string} [options.confirmText='Confirm'] - Text for the confirm button.
     * @param {string} [options.confirmButtonClass='bg-red-600 hover:bg-red-700'] - Classes for the confirm button.
     */
    function showConfirmationModal(title, message, onConfirm, options = {}) {
        const modal = document.getElementById('confirmation-modal');
        const titleEl = document.getElementById('confirmation-title');
        const messageEl = document.getElementById('confirmation-message');
        const confirmBtn = document.getElementById('confirmation-confirm-btn');
        const backdrop = document.getElementById('modal-backdrop');

        if (!modal || !titleEl || !messageEl || !confirmBtn || !backdrop) {
            console.error('Confirmation modal elements not found in the DOM. Using native confirm as a fallback.');
            // Fallback for critical confirmations if modal is missing
            if (confirm(message)) {
                onConfirm();
            }
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;

        // Apply options
        confirmBtn.textContent = options.confirmText || 'Confirm';
        // Reset to default and then apply new classes
        confirmBtn.className = 'px-4 py-2 text-sm font-semibold text-white rounded-lg transition';
        confirmBtn.classList.add(...(options.confirmButtonClass || 'bg-red-600 hover:bg-red-700').split(' '));

        // Clone and replace the button to remove old event listeners
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        const close = () => {
            modal.classList.add('opacity-0');
            modal.querySelector('.modal-content')?.classList.add('scale-95');
            backdrop.classList.add('opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                backdrop.classList.add('hidden');
            }, 300);
        };

        const onConfirmWrapper = () => {
            if (typeof onConfirm === 'function') {
                onConfirm();
            }
            close();
        };

        newConfirmBtn.addEventListener('click', onConfirmWrapper, { once: true });
        
        // Ensure cancel button works
        const cancelBtn = document.getElementById('confirmation-cancel-btn');
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', close, { once: true });
        backdrop.addEventListener('click', close, { once: true });

        // Show modal
        backdrop.classList.remove('hidden', 'opacity-0');
        modal.classList.remove('hidden', 'opacity-0');
        modal.querySelector('.modal-content')?.classList.remove('scale-95');
    }

    // Expose functions to the global window object
    window.showToast = showToast;
    window.showConfirmationModal = showConfirmationModal;

})(window);
