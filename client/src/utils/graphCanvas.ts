export const GRAPH_SETTINGS = {
    NODE_RADIUS: 16,
    LINK_COLOR: '#94a3b8',
    LINK_WIDTH: 2,
    ARROW_LENGTH: 10,
    ARROW_WIDTH: 5,
    NODE_MARGIN: 14,
    LABEL_FONT_SIZE: 4,
};

export const ICONS_SVG = {
    PROCESS:  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2310b981"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    REGISTRY: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2364748b"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`,
    USER:     `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
    COMPUTER: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23475569"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
    FILE:     `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2306b6d4"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
    TASK:     `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f59e0b"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm4-4H7v-2h9v2zm0-4H7V7h9v2z"/></svg>`,
    SERVICE:  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238b5cf6"><path d="M4 11h16v2H4zm0-4h16v2H4zm0 8h16v2H4zm-2-8c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V7zm2 10h16V7H4v10z"/></svg>`,
    GROUP:    `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236366f1"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
};

export type ThemeColors = {
    label: string;
    labelStroke: string;
    link: string;
    bundle: string;
    canvasBg: string;
};

export function getThemeColors(theme: 'light' | 'dark'): ThemeColors {
    if (theme === 'dark') {
        return {
            label: '#e2e8f0',
            labelStroke: 'rgba(2, 8, 23, 0.9)',
            link: '#64748b',
            bundle: '#cbd5e1',
            canvasBg: '#0a1324',
        };
    }
    return {
        label: '#1e293b',
        labelStroke: 'rgba(255, 255, 255, 0.9)',
        link: '#94a3b8',
        bundle: '#0f172a',
        canvasBg: '#f8fafc',
    };
}

export function drawNodeOnCanvas(
    node: any,
    ctx: any,
    globalScale: number,
    nodeIcons: Record<string, HTMLImageElement>,
    selectedNodes: any[],
    activePlaybackNodeIds?: Set<string>,
    themeColors?: Pick<ThemeColors, 'label' | 'labelStroke'>,
) {
    const isPlayback = activePlaybackNodeIds !== undefined;
    const isVisiblePlayback = isPlayback ? activePlaybackNodeIds.has(node.id) : true;

    ctx.save();

    if (isPlayback && !isVisiblePlayback) {
        ctx.globalAlpha = 0.15;
    } else if (isPlayback && isVisiblePlayback) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 15;
    }

    const rawLabel = node.properties?.name || node.name || node.id;
    const label = rawLabel.length > 20 ? rawLabel.substring(0, 12) + '...' : rawLabel;
    const iconSize = (node.label === 'User' || node.label === 'Computer') ? 34 : 26;

    if (selectedNodes.some((n: any) => n.id === node.id)) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, iconSize / 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
        ctx.fill();
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = '#eab308';
        ctx.stroke();
    } else if (node.is_red && (!isPlayback || isVisiblePlayback)) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, iconSize / 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.fill();
    }

    const iconImage = nodeIcons[node.label?.toLowerCase()] || nodeIcons['process'];
    if (iconImage) {
        ctx.drawImage(iconImage, node.x - iconSize / 2, node.y - iconSize / 2, iconSize, iconSize);
    }

    if (globalScale > 0.8) {
        const fontSize = Math.min(14, Math.max(10, 12 / globalScale));
        ctx.font = `500 ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const x = node.x;
        const y = node.y + iconSize / 2 + 2;
        ctx.strokeStyle = themeColors?.labelStroke || 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3 / globalScale;
        ctx.strokeText(label, x, y);
        ctx.fillStyle = (node.is_red && (!isPlayback || isVisiblePlayback))
            ? '#ef4444'
            : (themeColors?.label || '#1e293b');
        ctx.fillText(label, x, y);
    }

    ctx.restore();
}

export function drawCurvedLinkOnCanvas(
    link: any,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
    activePlaybackLinkIds?: Set<string>,
    themeColors?: Pick<ThemeColors, 'link' | 'bundle'>,
) {
    const startNode = link.source;
    const endNode = link.target;
    if (!startNode || !endNode || typeof startNode !== 'object' || typeof endNode !== 'object') return;

    const deltaX = endNode.x - startNode.x;
    const deltaY = endNode.y - startNode.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance === 0) return;

    const isPlayback = activePlaybackLinkIds !== undefined;
    const isVisiblePlayback = isPlayback ? activePlaybackLinkIds.has(link.id) : true;

    ctx.save();

    if (isPlayback && !isVisiblePlayback) {
        ctx.globalAlpha = 0.05;
    } else if (isPlayback && isVisiblePlayback) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8;
    }

    const totalOffset = GRAPH_SETTINGS.NODE_RADIUS + GRAPH_SETTINGS.NODE_MARGIN;
    const normalVector = { x: -deltaY / distance, y: deltaX / distance };
    const controlPointOffset = (link.curvature || 0) * distance;
    const controlPoint = {
        x: startNode.x + deltaX / 2 + normalVector.x * controlPointOffset,
        y: startNode.y + deltaY / 2 + normalVector.y * controlPointOffset,
    };

    const distToControlEnd = Math.sqrt(
        Math.pow(endNode.x - controlPoint.x, 2) + Math.pow(endNode.y - controlPoint.y, 2),
    );
    const distToControlStart = Math.sqrt(
        Math.pow(startNode.x - controlPoint.x, 2) + Math.pow(startNode.y - controlPoint.y, 2),
    );
    if (distToControlEnd === 0 || distToControlStart === 0) { ctx.restore(); return; }

    const targetTipX = endNode.x - ((endNode.x - controlPoint.x) / distToControlEnd) * totalOffset;
    const targetTipY = endNode.y - ((endNode.y - controlPoint.y) / distToControlEnd) * totalOffset;
    const sourceTipX = startNode.x - ((startNode.x - controlPoint.x) / distToControlStart) * totalOffset;
    const sourceTipY = startNode.y - ((startNode.y - controlPoint.y) / distToControlStart) * totalOffset;

    let linkColor = '#ef4444';
    if (link.is_red) {
        linkColor = '#ef4444';
    } else if (link.isBundle) {
        linkColor = themeColors?.bundle || '#0f172a';
    } else {
        linkColor = themeColors?.link || GRAPH_SETTINGS.LINK_COLOR;
    }

    ctx.beginPath();
    ctx.strokeStyle = linkColor;
    ctx.lineWidth = Math.max((link.is_red || link.isBundle ? 3 : GRAPH_SETTINGS.LINK_WIDTH) / globalScale, 0.8);
    ctx.moveTo(sourceTipX, sourceTipY);
    ctx.quadraticCurveTo(
        controlPoint.x, controlPoint.y,
        targetTipX - ((endNode.x - controlPoint.x) / distToControlEnd) * (GRAPH_SETTINGS.ARROW_LENGTH * 0.8),
        targetTipY - ((endNode.y - controlPoint.y) / distToControlEnd) * (GRAPH_SETTINGS.ARROW_LENGTH * 0.8),
    );
    ctx.stroke();

    const baseX = targetTipX - ((endNode.x - controlPoint.x) / distToControlEnd) * GRAPH_SETTINGS.ARROW_LENGTH;
    const baseY = targetTipY - ((endNode.y - controlPoint.y) / distToControlEnd) * GRAPH_SETTINGS.ARROW_LENGTH;
    ctx.beginPath();
    ctx.fillStyle = linkColor;
    ctx.moveTo(targetTipX, targetTipY);
    ctx.lineTo(
        baseX - ((endNode.y - controlPoint.y) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH,
        baseY + ((endNode.x - controlPoint.x) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH,
    );
    ctx.lineTo(
        baseX + ((endNode.y - controlPoint.y) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH,
        baseY - ((endNode.x - controlPoint.x) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH,
    );
    ctx.closePath();
    ctx.fill();

    if (globalScale >= 0.8) {
        const label = link.type || link.label || '';
        if (!label) { ctx.restore(); return; }

        const textPos = {
            x: 0.25 * startNode.x + 0.5 * controlPoint.x + 0.25 * endNode.x,
            y: 0.25 * startNode.y + 0.5 * controlPoint.y + 0.25 * endNode.y,
        };
        let textAngle = Math.atan2(endNode.y - startNode.y, endNode.x - startNode.x);
        if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) textAngle += Math.PI;

        const baseFontSize = GRAPH_SETTINGS.LABEL_FONT_SIZE > 5 ? GRAPH_SETTINGS.LABEL_FONT_SIZE : 10;
        const fontSize = Math.max(baseFontSize / globalScale, 2);
        const isDarkMode = document.body.getAttribute('data-theme') === 'dark';

        ctx.font = link.isBundle ? `700 ${fontSize}px Inter, sans-serif` : `600 ${fontSize}px Inter, sans-serif`;
        const textWidth = ctx.measureText(label).width;
        const bgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.6);

        ctx.translate(textPos.x, textPos.y);
        ctx.rotate(textAngle);
        ctx.fillStyle = isDarkMode
            ? 'rgba(30, 41, 59, 0.95)'
            : (link.isBundle ? 'rgba(241, 245, 249, 0.95)' : 'rgba(255, 255, 255, 0.95)');
        ctx.fillRect(-bgDimensions[0] / 2, -bgDimensions[1] / 2 - fontSize * 0.4, bgDimensions[0], bgDimensions[1]);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDarkMode
            ? (link.is_red ? '#ff6b6b' : '#cbd5e1')
            : (link.isBundle ? '#0f172a' : (link.is_red ? '#ef4444' : '#475569'));
        ctx.fillText(label, 0, -(fontSize * 0.4));
    }

    ctx.restore();
}
