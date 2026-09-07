// frontend/js/utils/MarkdownParser.js

class MarkdownParser {
    static parse(text) {
        if (!text) return '';
        if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
            console.error('marked.js o DOMPurify non caricati');
            return text;
        }
        try {
            const rawHtml = marked.parse(text);
            return DOMPurify.sanitize(rawHtml);
        } catch (e) {
            console.error('Errore parsing markdown:', e);
            return text;
        }
    }
}

window.MarkdownParser = MarkdownParser;