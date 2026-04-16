import * as Phaser from 'phaser';
import { createCharacterCanvas, FRAME_W, FRAME_H } from './sprites.js';
import { calculateDeskPositions, LANE_CONFIG, DEFAULT_LANE, GRID_PADDING } from './layout.js';

export default class OfficeScene extends Phaser.Scene {
  constructor() {
    super('OfficeScene');
    this.agents = {};
    this._initialAgents = null;
  }

  // Called from React to set initial agent data before scene is fully created
  setInitialAgents(agents) {
    this._initialAgents = agents;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.drawBackground(W, H);

    if (this._initialAgents) {
      this.spawnAllAgents(this._initialAgents, W, H);
    }

    // Idle tick — gentle wandering for idle agents
    this.time.addEvent({
      delay: 2000, loop: true,
      callback: () => this.tickIdle(),
    });
  }

  drawBackground(W, H) {
    const g = this.add.graphics();

    // Dark floor gradient
    g.fillGradientStyle(0x08080f, 0x08080f, 0x0a0a18, 0x0a0a18, 1);
    g.fillRect(0, 0, W, H);

    // Subtle grid
    g.lineStyle(1, 0x4285F4, 0.04);
    for (let x = 0; x < W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.strokePath(); }
    for (let y = 0; y < H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.strokePath(); }
  }

  spawnAllAgents(agents, W, H) {
    const { positions, laneGroups } = calculateDeskPositions(agents, W, H);

    // Draw lane clusters (background zones)
    const drawnLanes = new Set();
    for (const [lane, laneAgents] of Object.entries(laneGroups)) {
      const firstPos = positions[laneAgents[0]?.slug];
      if (!firstPos || drawnLanes.has(lane)) continue;
      drawnLanes.add(lane);

      const config = LANE_CONFIG[lane] || DEFAULT_LANE;

      // Lane floor glow
      const glow = this.add.graphics();
      glow.fillStyle(config.color, 0.05);
      glow.fillRoundedRect(firstPos.clusterX + 5, firstPos.clusterY + 5, firstPos.clusterW - 10, firstPos.clusterH - 10, 8);

      // Lane border
      glow.lineStyle(1, config.color, 0.15);
      glow.strokeRoundedRect(firstPos.clusterX + 5, firstPos.clusterY + 5, firstPos.clusterW - 10, firstPos.clusterH - 10, 8);

      // Lane label
      this.add.text(firstPos.clusterX + 12, firstPos.clusterY + 10, config.label, {
        fontFamily: "'Courier New', monospace",
        fontSize: '8px',
        color: '#' + config.color.toString(16).padStart(6, '0'),
        letterSpacing: 2,
      }).setAlpha(0.6).setDepth(1);
    }

    // Spawn each agent character
    let charIndex = 0;
    for (const agentData of agents) {
      const pos = positions[agentData.slug];
      if (!pos) continue;

      const laneColor = pos.laneColor;
      const texKey = `char_${agentData.slug}`;

      // Create character texture from canvas
      const canvas = createCharacterCanvas(laneColor, charIndex);
      this.textures.addCanvas(texKey, canvas);

      // Draw desk at position
      this.drawDesk(pos.x, pos.y, laneColor);

      // Create sprite (show idle frame 8)
      const sprite = this.add.image(pos.x, pos.y - 20, texKey);
      sprite.setScale(2.5);
      sprite.setCrop(FRAME_W * 8, 0, FRAME_W, FRAME_H);
      sprite.setDepth(10 + charIndex);
      sprite.setInteractive({ useHandCursor: true });

      // Click handler — emits DOM event for React tooltip
      sprite.on('pointerdown', () => {
        window.dispatchEvent(new CustomEvent('mc-agent-click', {
          detail: { slug: agentData.slug, name: agentData.name, lane: agentData.lane, x: sprite.x, y: sprite.y }
        }));
      });

      // Name label
      const label = this.add.text(pos.x, pos.y - 44, this.shortenName(agentData.name), {
        fontFamily: "'Courier New', monospace",
        fontSize: '7px',
        color: '#' + laneColor.toString(16).padStart(6, '0'),
        stroke: '#07070f',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(11 + charIndex);

      // Status bubble (hidden by default)
      const bubble = this.add.text(pos.x, pos.y - 56, '', {
        fontFamily: "'Courier New', monospace",
        fontSize: '6px',
        color: '#aaa',
        backgroundColor: '#0d111799',
        padding: { x: 3, y: 1 },
        stroke: '#07070f',
        strokeThickness: 1,
      }).setOrigin(0.5).setDepth(12 + charIndex).setVisible(false);

      // Status dot
      const dot = this.add.graphics().setDepth(13 + charIndex);

      this.agents[agentData.slug] = {
        data: agentData,
        sprite, label, bubble, dot,
        texKey,
        homeX: pos.x,
        homeY: pos.y - 20,
        currentAnimState: 'idle',
        _frameTimer: null,
      };

      // Start with idle bob
      this.tweens.add({
        targets: sprite,
        y: pos.y - 23,
        yoyo: true, repeat: -1,
        duration: 1200 + Math.random() * 800,
        ease: 'Sine.easeInOut',
        delay: Math.random() * 1000,
      });

      charIndex++;
    }
  }

  drawDesk(x, y, color) {
    const g = this.add.graphics().setDepth(5);

    // Desk surface
    g.fillStyle(0x1a1208, 1);
    g.fillRoundedRect(x - 18, y - 6, 36, 12, 2);
    g.lineStyle(1, 0x2a2010, 1);
    g.strokeRoundedRect(x - 18, y - 6, 36, 12, 2);

    // Monitor
    g.fillStyle(0x0a0a18, 1);
    g.fillRoundedRect(x - 10, y - 22, 20, 14, 2);
    g.lineStyle(1, 0x333355, 1);
    g.strokeRoundedRect(x - 10, y - 22, 20, 14, 2);

    // Monitor stand
    g.lineStyle(2, 0x222233, 1);
    g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x, y - 6); g.strokePath();

    // Keyboard
    g.fillStyle(0x111122, 1);
    g.fillRoundedRect(x - 8, y - 2, 16, 4, 1);
  }

  shortenName(name) {
    // Shorten long names for labels
    return name
      .replace(/ Agent$/, '')
      .replace(/\//g, '/')
      .replace(/ and /g, ' & ')
      .slice(0, 16);
  }

  // ── Frame animation helpers ──────────────────────────────

  setFrame(slug, frameCol) {
    const agent = this.agents[slug];
    if (!agent) return;
    agent.sprite.setCrop(FRAME_W * frameCol, 0, FRAME_W, FRAME_H);
  }

  startFrameLoop(slug, frames, fps) {
    const agent = this.agents[slug];
    if (!agent) return;
    this.stopFrameLoop(slug);
    let fi = 0;
    agent._frameTimer = this.time.addEvent({
      delay: Math.round(1000 / fps), loop: true,
      callback: () => {
        this.setFrame(slug, frames[fi % frames.length]);
        fi++;
      },
    });
  }

  stopFrameLoop(slug) {
    const agent = this.agents[slug];
    if (!agent) return;
    if (agent._frameTimer) { agent._frameTimer.remove(); agent._frameTimer = null; }
  }

  // ── Agent state setters ──────────────────────────────────

  setAgentIdle(slug) {
    const agent = this.agents[slug];
    if (!agent) return;
    this.stopFrameLoop(slug);
    this.setFrame(slug, 8);
    agent.bubble.setVisible(false);
    this.updateDot(slug, 0x333333);

    // Resume idle bob
    this.tweens.killTweensOf(agent.sprite);
    this.tweens.add({
      targets: agent.sprite,
      y: agent.homeY - 3,
      yoyo: true, repeat: -1,
      duration: 1200 + Math.random() * 800,
      ease: 'Sine.easeInOut',
    });
  }

  setAgentWorking(slug, task) {
    const agent = this.agents[slug];
    if (!agent) return;
    this.tweens.killTweensOf(agent.sprite);
    agent.sprite.y = agent.homeY;
    this.startFrameLoop(slug, [9, 8], 5);
    agent.bubble.setText(task || 'Working...').setVisible(true);
    this.updateDot(slug, 0x9C27B0);
    this.flashMonitor(agent.homeX, agent.homeY + 20, agent.data?.lane);
  }

  setAgentQueued(slug) {
    const agent = this.agents[slug];
    if (!agent) return;
    this.tweens.killTweensOf(agent.sprite);
    // Walk animation — cycle walk frames
    this.startFrameLoop(slug, [0, 1, 2, 3], 8);
    agent.bubble.setText('Queued...').setVisible(true);
    this.updateDot(slug, 0x00BCD4);

    // Small walk motion
    this.tweens.add({
      targets: [agent.sprite, agent.label, agent.bubble],
      x: agent.homeX + (Math.random() - 0.5) * 20,
      duration: 800,
      ease: 'Linear',
      onComplete: () => {
        this.stopFrameLoop(slug);
        this.setFrame(slug, 8);
      },
    });
  }

  setAgentReporting(slug) {
    const agent = this.agents[slug];
    if (!agent) return;
    this.tweens.killTweensOf(agent.sprite);
    agent.sprite.y = agent.homeY;
    this.startFrameLoop(slug, [8, 9], 6);
    agent.bubble.setText('Reporting...').setVisible(true);
    this.updateDot(slug, 0x34A853);
    this.spawnDataPacket(agent.homeX, agent.homeY);
  }

  setAgentBlocked(slug) {
    const agent = this.agents[slug];
    if (!agent) return;
    this.tweens.killTweensOf(agent.sprite);
    agent.sprite.y = agent.homeY;
    this.setFrame(slug, 8);
    agent.bubble.setText('Blocked').setVisible(true);
    this.updateDot(slug, 0xFFAB00);

    // Amber pulse
    this.tweens.add({
      targets: agent.sprite,
      alpha: { from: 1, to: 0.5 },
      yoyo: true, repeat: -1, duration: 800,
    });
  }

  setAgentError(slug) {
    const agent = this.agents[slug];
    if (!agent) return;
    this.tweens.killTweensOf(agent.sprite);
    agent.sprite.y = agent.homeY;
    agent.sprite.alpha = 1;
    this.startFrameLoop(slug, [11, 8], 4);
    agent.bubble.setText('ERROR!').setVisible(true);
    this.updateDot(slug, 0xFF1744);

    // Shake
    this.tweens.add({
      targets: [agent.sprite, agent.label],
      x: { from: agent.homeX - 3, to: agent.homeX + 3 },
      yoyo: true, repeat: 5, duration: 60,
      onComplete: () => {
        agent.sprite.x = agent.homeX;
        agent.label.x = agent.homeX;
      },
    });
  }

  setAgentValidating(slug) {
    const agent = this.agents[slug];
    if (!agent) return;
    this.tweens.killTweensOf(agent.sprite);
    agent.sprite.y = agent.homeY;
    this.startFrameLoop(slug, [9, 8], 3);
    agent.bubble.setText('Validating...').setVisible(true);
    this.updateDot(slug, 0x2196F3);
  }

  setAgentCelebrate(slug) {
    const agent = this.agents[slug];
    if (!agent) return;
    this.tweens.killTweensOf(agent.sprite);
    agent.sprite.y = agent.homeY;
    agent.sprite.alpha = 1;
    this.startFrameLoop(slug, [10, 8], 4);
    agent.bubble.setText('Done!').setVisible(true);
    this.updateDot(slug, 0xFFD600);

    // Jump
    this.tweens.add({
      targets: agent.sprite,
      y: agent.homeY - 15,
      yoyo: true, repeat: 3, duration: 200,
      ease: 'Quad.easeOut',
    });

    // Stars
    this.spawnStars(agent.homeX, agent.homeY);
  }

  // ── Visual helpers ─────────────────────────────────────

  updateDot(slug, color) {
    const agent = this.agents[slug];
    if (!agent) return;
    agent.dot.clear();
    agent.dot.fillStyle(color, 1);
    agent.dot.fillCircle(agent.sprite.x + 10, agent.sprite.y - 10, 3);
  }

  flashMonitor(x, y, lane) {
    const config = LANE_CONFIG[lane] || DEFAULT_LANE;
    const flash = this.add.graphics().setDepth(8);
    flash.fillStyle(config.color, 0.2);
    flash.fillRoundedRect(x - 12, y - 24, 24, 16, 2);
    this.tweens.add({
      targets: flash, alpha: { from: 1, to: 0 },
      duration: 800, onComplete: () => flash.destroy(),
    });
  }

  spawnDataPacket(fromX, fromY) {
    const labels = ['DATA', 'REPORT', 'OK', '>>'];
    const lbl = labels[Math.floor(Math.random() * labels.length)];
    const t = this.add.text(fromX, fromY - 20, lbl, {
      fontFamily: "'Courier New'", fontSize: '7px', color: '#fff',
      backgroundColor: '#4285F4', padding: { x: 3, y: 1 },
    }).setDepth(51);

    const W = this.scale.width;
    this.tweens.add({
      targets: t,
      x: W / 2 + (Math.random() - 0.5) * 60,
      y: 20,
      alpha: { from: 1, to: 0 },
      duration: 900 + Math.random() * 300,
      ease: 'Quad.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  spawnStars(x, y) {
    const chars = ['*', '+', '.', '*'];
    for (let i = 0; i < 5; i++) {
      const star = this.add.text(x, y, chars[i % 4], {
        fontSize: '12px', color: '#FFD600',
      }).setDepth(60).setOrigin(0.5);
      this.tweens.add({
        targets: star,
        x: x + (Math.random() - 0.5) * 50,
        y: y - 30 - Math.random() * 20,
        alpha: { from: 1, to: 0 },
        scale: { from: 1, to: 0.3 },
        duration: 700 + Math.random() * 300,
        delay: i * 60,
        onComplete: () => star.destroy(),
      });
    }
  }

  // ── Main state update method (called from React) ──────

  updateAgentStates(agents) {
    if (!agents) return;

    // If agents haven't been spawned yet, spawn them
    if (Object.keys(this.agents).length === 0 && agents.length > 0) {
      this.spawnAllAgents(agents, this.scale.width, this.scale.height);
      return;
    }

    for (const agentData of agents) {
      const agent = this.agents[agentData.slug];
      if (!agent) continue;

      const prevState = agent.currentAnimState;
      const newState = agentData.animState;

      if (prevState === newState) continue;
      agent.currentAnimState = newState;
      agent.data = agentData;

      switch (newState) {
        case 'idle':       this.setAgentIdle(agentData.slug); break;
        case 'queued':     this.setAgentQueued(agentData.slug); break;
        case 'working':    this.setAgentWorking(agentData.slug, agentData.stateDetail?.task || 'Processing...'); break;
        case 'reporting':  this.setAgentReporting(agentData.slug); break;
        case 'blocked':    this.setAgentBlocked(agentData.slug); break;
        case 'error':      this.setAgentError(agentData.slug); break;
        case 'validating': this.setAgentValidating(agentData.slug); break;
        case 'done':       this.setAgentCelebrate(agentData.slug); break;
      }
    }
  }

  tickIdle() {
    // Subtle idle movements for idle agents
    Object.entries(this.agents).forEach(([slug, agent]) => {
      if (agent.currentAnimState === 'idle' && Math.random() < 0.08) {
        // Gentle sway
        agent.dot.clear();
        agent.dot.fillStyle(0x333333, 1);
        agent.dot.fillCircle(agent.sprite.x + 10, agent.sprite.y - 10, 3);
      }
    });
  }

  update() {
    // Update dot positions to follow sprites (for agents in motion)
    Object.values(this.agents).forEach(agent => {
      if (agent.currentAnimState !== 'idle') {
        const dotColor = {
          queued: 0x00BCD4, working: 0x9C27B0, reporting: 0x34A853,
          error: 0xFF1744, done: 0xFFD600, blocked: 0xFFAB00, validating: 0x2196F3,
        }[agent.currentAnimState] || 0x333333;
        agent.dot.clear();
        agent.dot.fillStyle(dotColor, 1);
        agent.dot.fillCircle(agent.sprite.x + 10, agent.sprite.y - 10, 3);
      }
    });
  }
}
