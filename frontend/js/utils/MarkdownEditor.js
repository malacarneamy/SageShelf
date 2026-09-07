// frontend/js/utils/MarkdownEditor.js

class MarkdownEditor {
    static setup(textarea, onInputCallback) {
        textarea.addEventListener('keydown', (e) => {
            const start = textarea.selectionStart;
            const end   = textarea.selectionEnd;
            const value = textarea.value;

            // Auto-pairing e wrapping
            const pairs = { '(':')', '[':']', '{':'}', '"':'"', "'":"'", '`':'`', '*':'*', '_':'_' };
            if (pairs[e.key]) {
                const closing = pairs[e.key];

                // "Type-through": se il carattere digitato è di chiusura di una
                // coppia simmetrica (", ', `, *, _) e il cursore è subito prima
                // di quella stessa chiusura già presente, ci si limita a
                // scavalcarla invece di inserirne un'altra coppia.
                if (start === end && e.key === closing && value[start] === closing) {
                    e.preventDefault();
                    textarea.setSelectionRange(start + 1, start + 1);
                    onInputCallback();
                    return;
                }

                e.preventDefault();
                if (start !== end) {
                    const selected = value.substring(start, end);
                    textarea.value = value.substring(0, start) + e.key + selected + closing + value.substring(end);
                    textarea.setSelectionRange(start + 1, end + 1);
                } else {
                    textarea.value = value.substring(0, start) + e.key + closing + value.substring(start);
                    textarea.setSelectionRange(start + 1, start + 1);
                }
                onInputCallback();
                return;
            }

            // Auto-completamento liste
            if (e.key === 'Enter') {
                const textBefore = value.substring(0, start);
                const textAfter  = value.substring(start);
                const lastLine   = textBefore.split('\n').pop();
                const bulletMatch   = lastLine.match(/^(\s*)([*+-])\s+(.*)$/);
                const numberedMatch = lastLine.match(/^(\s*)(\d+)\.\s+(.*)$/);

                // Riga della lista senza contenuto: esce dalla lista invece di
                // continuarla all'infinito con marcatori vuoti.
                const emptyBullet   = bulletMatch   && bulletMatch[3].trim()   === '';
                const emptyNumbered = numberedMatch && numberedMatch[3].trim() === '';
                if (emptyBullet || emptyNumbered) {
                    e.preventDefault();
                    const lineStart = start - lastLine.length;
                    textarea.value = value.substring(0, lineStart) + textAfter;
                    textarea.setSelectionRange(lineStart, lineStart);
                    onInputCallback();
                    return;
                }

                let insertion = '';
                if (bulletMatch)        insertion = `${bulletMatch[1]}${bulletMatch[2]} `;
                else if (numberedMatch) insertion = `${numberedMatch[1]}${parseInt(numberedMatch[2]) + 1}. `;
                if (insertion) {
                    e.preventDefault();
                    textarea.value = textBefore + '\n' + insertion + textAfter;
                    const newPos = start + insertion.length + 1;
                    textarea.setSelectionRange(newPos, newPos);
                    onInputCallback();
                }
            }
        });

        textarea.addEventListener('input', onInputCallback);
    }
}

window.MarkdownEditor = MarkdownEditor;