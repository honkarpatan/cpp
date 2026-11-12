// utils.js
/**
 * Register custom svg icon
 * @param {string} className - The class name (e.g., 'my-icon')
 * @param {string} svgString - The raw SVG code
 */
export function registerIcon(className, svgString) {
    // SVG cleanup & Encoding
    // %23 convert =>
    const encodedSvg = encodeURIComponent(svgString)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');

    // CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .${className} {
            background-image: url('data:image/svg+xml;utf8,${encodedSvg}');
            background-repeat: no-repeat;
            background-position: center;
            background-size: contain;
            width: 1em; 
            height: 1em;
            display: inline-block;
        }
        .icon.${className} {
            background-size: 20px; 
            filter: none !important; /* Acode defaut filter remove */
        }
    `;
    document.head.appendChild(style);
}