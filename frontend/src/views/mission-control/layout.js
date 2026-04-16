// Lane layout configuration — maps agent lanes to desk cluster positions
// Grid: 3 columns x 3 rows, each cluster holds N agent desks

export const LANE_CONFIG = {
  'System / Infrastructure':               { row: 0, col: 0, color: 0x6366F1, label: 'SYSTEM' },
  'SEO Operations':                        { row: 0, col: 1, color: 0x10B981, label: 'SEO OPS' },
  'Paid Acquisition and Conversion':       { row: 0, col: 2, color: 0xF59E0B, label: 'PAID / ADS' },
  'Website Content, UX, and Design':       { row: 1, col: 0, color: 0x3B82F6, label: 'WEBSITE / UX' },
  'Local Authority, Reviews, and GBP':     { row: 1, col: 1, color: 0x8B5CF6, label: 'LOCAL / GBP' },
  'Innovation and Competitive Edge':       { row: 1, col: 2, color: 0xEC4899, label: 'COMPETITIVE' },
  'Social Publishing and Engagement':      { row: 2, col: 0, color: 0x06B6D4, label: 'SOCIAL' },
  'Reporting':                             { row: 2, col: 1, color: 0x84CC16, label: 'REPORTING' },
  'Analytics':                             { row: 2, col: 2, color: 0xF97316, label: 'ANALYTICS' },
  'Content':                               { row: 2, col: 1, color: 0x84CC16, label: 'CONTENT' },
  'Governance':                            { row: 1, col: 0, color: 0x3B82F6, label: 'GOVERNANCE' },
  'Strategy':                              { row: 1, col: 2, color: 0xEC4899, label: 'STRATEGY' },
  'Competitive Intel':                     { row: 1, col: 2, color: 0xEC4899, label: 'COMPETITIVE' },
  'Social':                                { row: 2, col: 0, color: 0x06B6D4, label: 'SOCIAL' },
  'Website & UX':                          { row: 1, col: 0, color: 0x3B82F6, label: 'WEBSITE / UX' },
  'Local & Maps':                          { row: 1, col: 1, color: 0x8B5CF6, label: 'LOCAL / MAPS' },
  'Paid Ads':                              { row: 0, col: 2, color: 0xF59E0B, label: 'PAID ADS' },
};

// Default fallback for unknown lanes
export const DEFAULT_LANE = { row: 2, col: 2, color: 0x666666, label: 'OTHER' };

// Grid dimensions
export const GRID_COLS = 3;
export const GRID_ROWS = 3;
export const GRID_PADDING = 20;
export const CLUSTER_PADDING = 15;
export const DESK_SPACING_X = 70;
export const DESK_SPACING_Y = 55;

/**
 * Calculate desk positions for all agents within the canvas dimensions
 * Returns a map of agentSlug -> { x, y, clusterX, clusterY, laneColor }
 */
export function calculateDeskPositions(agents, canvasW, canvasH) {
  // Group agents by lane
  const laneGroups = {};
  for (const agent of agents) {
    const lane = agent.lane || 'Other';
    if (!laneGroups[lane]) laneGroups[lane] = [];
    laneGroups[lane].push(agent);
  }

  // Calculate cluster sizes
  const clusterW = (canvasW - GRID_PADDING * 2) / GRID_COLS;
  const clusterH = (canvasH - GRID_PADDING * 2) / GRID_ROWS;

  const positions = {};

  for (const [lane, laneAgents] of Object.entries(laneGroups)) {
    const config = LANE_CONFIG[lane] || DEFAULT_LANE;
    const clusterX = GRID_PADDING + config.col * clusterW;
    const clusterY = GRID_PADDING + config.row * clusterH;

    // Position agents within cluster
    const maxPerRow = Math.ceil(Math.sqrt(laneAgents.length));
    laneAgents.forEach((agent, i) => {
      const row = Math.floor(i / maxPerRow);
      const col = i % maxPerRow;
      positions[agent.slug] = {
        x: clusterX + CLUSTER_PADDING + col * DESK_SPACING_X + 35,
        y: clusterY + CLUSTER_PADDING + 25 + row * DESK_SPACING_Y + 30,
        clusterX,
        clusterY,
        clusterW,
        clusterH,
        laneColor: config.color,
        laneLabel: config.label,
      };
    });
  }

  return { positions, laneGroups };
}
