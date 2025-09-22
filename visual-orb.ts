/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

interface Glitter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: 'gold' | 'blue';
}

const MAX_GLITTERS = 300;

@customElement('gdm-live-audio-visuals-orb')
export class GdmLiveAudioVisualsOrb extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private glitters: Glitter[] = [];

  @property({attribute: false})
  set outputNode(node: AudioNode) {
    if (node) {
      this.outputAnalyser = new Analyser(node);
    }
  }

  @property({attribute: false})
  set inputNode(node: AudioNode) {
    if (node) {
      this.inputAnalyser = new Analyser(node);
    }
  }

  static styles = css`
    :host {
      display: block;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  `;

  private getAverage(data: Uint8Array): number {
    if (!data) return 0;
    const sum = data.reduce((a, b) => a + b, 0);
    return (sum / data.length) / 255; // Normalize to 0-1
  }

  private init() {
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.animation();
  }

  private resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.offsetWidth * dpr;
    this.canvas.height = this.offsetHeight * dpr;
    this.ctx.scale(dpr, dpr);
  }

  private addNewGlitter(
    x: number,
    y: number,
    energy: number,
    color: 'gold' | 'blue',
  ) {
    if (this.glitters.length >= MAX_GLITTERS) {
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * energy * 5;
    const life = 60 + Math.random() * 60;

    this.glitters.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1 + Math.random() * 2,
      life: life,
      maxLife: life,
      color: color,
    });
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    if (!this.ctx || !this.inputAnalyser || !this.outputAnalyser) return;

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const inputAvg = this.getAverage(this.inputAnalyser.data);
    const outputAvg = this.getAverage(this.outputAnalyser.data);

    const centerX = this.offsetWidth / 2;
    const centerY = this.offsetHeight / 2;
    const orbRadius = Math.min(this.offsetWidth, this.offsetHeight) / 3;

    // Clear canvas
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = 'rgba(13, 17, 23, 1)'; // Match background
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Add new glitters for user input (gold)
    const inputGlittersToAdd = Math.floor(inputAvg * 1.5 * 10);
    for (let i = 0; i < inputGlittersToAdd; i++) {
      this.addNewGlitter(centerX, centerY, inputAvg * 1.5, 'gold');
    }

    // Add new glitters for AI output (blue)
    const outputGlittersToAdd = Math.floor(outputAvg * 1.5 * 10);
    for (let i = 0; i < outputGlittersToAdd; i++) {
      this.addNewGlitter(centerX, centerY, outputAvg * 1.5, 'blue');
    }

    // Draw orb container using a stroke with a glow
    this.ctx.strokeStyle = `rgba(135, 206, 235, ${
      0.5 + outputAvg * 0.5
    })`; // skyblue, glows with AI voice
    this.ctx.lineWidth = 1.5;
    this.ctx.shadowColor = 'rgb(135, 206, 235)';
    this.ctx.shadowBlur = 10;

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
    this.ctx.stroke();

    // Reset shadow for glitters
    this.ctx.shadowBlur = 0;

    // Update and draw glitters
    this.ctx.globalCompositeOperation = 'lighter';
    this.glitters.forEach((g, index) => {
      // Update position
      g.x += g.vx;
      g.y += g.vy;

      // Apply forces (gravity towards center, friction)
      const dx = centerX - g.x;
      const dy = centerY - g.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      g.vx += dx * 0.0005; // Center pull
      g.vy += dy * 0.0005;
      g.vx *= 0.98; // Friction
      g.vy *= 0.98;

      // Bounce off the orb's inner wall
      if (dist > orbRadius) {
        const normalX = dx / dist;
        const normalY = dy / dist;
        const dot = g.vx * normalX + g.vy * normalY;
        g.vx -= 1.8 * dot * normalX;
        g.vy -= 1.8 * dot * normalY;
        // Reposition to prevent sticking
        g.x = centerX - normalX * orbRadius;
        g.y = centerY - normalY * orbRadius;
      }

      // Update life
      g.life -= 1;
      if (g.life <= 0) {
        this.glitters.splice(index, 1);
        return;
      }

      // Draw glitter
      const opacity = (g.life / g.maxLife) * 0.9;
      let colorRgba: string;
      if (g.color === 'gold') {
        colorRgba = `rgba(255, 215, 0, ${opacity})`; // Gold
      } else {
        colorRgba = `rgba(173, 216, 230, ${opacity})`; // lightblue
      }
      this.ctx.beginPath();
      this.ctx.fillStyle = colorRgba;
      this.ctx.arc(g.x, g.y, g.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  protected firstUpdated() {
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-orb': GdmLiveAudioVisualsOrb;
  }
}
