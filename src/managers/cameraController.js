// CameraController: орбитальная камера с поддержкой мультитач, зума, панорамирования
import * as THREE from 'three';

export class CameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    
    // Позиция камеры
    this.target = new THREE.Vector3(0, 1.2, 0);
    this.yaw = 0.7;
    this.pitch = 0.52;
    this.dist = 27;
    
    // Состояние взаимодействия
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.lastInteract = -10;
    this.autoRotate = true;
    
    // Мультитач жесты
    this.pointers = new Map();
    this.gesture = null;
    this.tapId = null;
    this.clickPos = null;
    this.clickMoved = false;
    this.pinchStart = 0;
    this.pinchMoved = false;
    this.pinchPrev = null;
    this.gestureStart = 0;
    this.panLast = null;
  }

  /**
   * Регистрирует взаимодействие с камерой
   */
  interact() {
    this.lastInteract = performance.now() / 1000;
  }

  /**
   * Сбрасывает камеру в стандартное положение
   */
  reset() {
    this.target.set(0, 1.2, 0);
    this.yaw = 0.7;
    this.pitch = 0.52;
    this.dist = 27;
    this.autoRotate = true;
  }

  /**
   * Начинает перетаскивание камеры
   * @param {number} x - координата X
   * @param {number} y - координата Y
   */
  dragStart(x, y) {
    this.dragging = true;
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Перетаскивает камеру
   * @param {number} x - координата X
   * @param {number} y - координата Y
   */
  drag(x, y) {
    this.yaw -= (x - this.lastX) * 0.005;
    this.pitch = Math.min(1.35, Math.max(0.15, this.pitch + (y - this.lastY) * 0.004));
    this.lastX = x;
    this.lastY = y;
    this.interact();
  }

  /**
   * Завершает перетаскивание
   */
  dragEnd() {
    this.dragging = false;
  }

  /**
   * Зум колесом мыши
   * @param {number} dy - дельта прокрутки
   */
  zoom(dy) {
    this.dist = Math.min(44, Math.max(13, this.dist + dy * 0.01 * this.dist * 0.5));
    this.interact();
  }

  /**
   * Зум через соотношение расстояний (мультитач щипок)
   * @param {number} ratio - соотношение масштаба
   */
  zoomByRatio(ratio) {
    if (!(ratio > 0)) {return;}
    this.dist = Math.min(44, Math.max(13, this.dist / ratio));
    this.interact();
  }

  /**
   * Панорамирование камеры
   * @param {number} dx - смещение по X в пикселях
   * @param {number} dy - смещение по Y в пикселях
   */
  pan(dx, dy) {
    this.camera.updateMatrixWorld();
    const h = (Math.tan(this.camera.fov * Math.PI / 360) * 2 * this.dist) / window.innerHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    
    this.target.addScaledVector(right, -dx * h);
    this.target.addScaledVector(up, -dy * h);
    
    // Границы уровня — нельзя улететь в пустоту
    this.target.x = Math.max(-19, Math.min(19, this.target.x));
    this.target.y = Math.max(-0.5, Math.min(7, this.target.y));
    this.target.z = Math.max(-19, Math.min(19, this.target.z));
    
    this.interact();
  }

  /**
   * Обновляет позицию камеры
   * @param {number} dt - дельта времени
   */
  update(dt) {
    const now = performance.now() / 1000;
    
    // Автоматическое вращение если нет взаимодействия
    if (!this.dragging && this.autoRotate && now - this.lastInteract > 5) {
      this.yaw += dt * 0.05;
    }
    
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + sp * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist
    );
    
    this.camera.lookAt(this.target);
  }

  /**
   * Обрабатывает нажатие pointer
   * @param {PointerEvent} e
   * @returns {string|null} тип жеста или null
   */
  handlePointerDown(e) {
    this.interact();
    
    if (this.pointers.size === 0) {
      if (e.button === 0 || e.pointerType === 'touch') {
        // Одиночное касание: ждём — тап или драг
        this.gesture = 'tap';
        this.tapId = e.pointerId;
        this.clickPos = { x: e.clientX, y: e.clientY };
        this.clickMoved = false;
        this.gestureStart = performance.now();
        return 'tap';
      } else if (e.button === 1) {
        // Средняя кнопка — сдвиг уровня
        this.gesture = 'pan';
        this.tapId = e.pointerId;
        this.clickPos = null;
        this.panLast = { x: e.clientX, y: e.clientY };
        return 'pan';
      } else {
        // Правая кнопка — сразу вращение
        this.gesture = 'drag';
        this.tapId = e.pointerId;
        this.clickPos = null;
        this.dragStart(e.clientX, e.clientY);
        return 'drag';
      }
    } else if (this.pointers.size === 1) {
      // Щипок: зум + сдвиг одновременно.
      // Второй палец ещё не добавлен в this.pointers (addPointer вызывается
      // после handlePointerDown), поэтому берём его координаты из события.
      const [a] = [...this.pointers.values()];
      const b = { x: e.clientX, y: e.clientY };
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMoved = false;
      this.pinchPrev = null;
      this.gestureStart = performance.now();
      this.gesture = 'pinch';
      this.clickPos = null;
      this.dragEnd();
      return 'pinch';
    }
    
    return null;
  }

  /**
   * Добавляет pointer для отслеживания
   * @param {PointerEvent} e
   */
  addPointer(e) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  /**
   * Обрабатывает движение pointer
   * @param {PointerEvent} e
   */
  handlePointerMove(e) {
    if (!this.pointers.has(e.pointerId)) {return;}
    
    const p = this.pointers.get(e.pointerId);
    p.x = e.clientX;
    p.y = e.clientY;
    
    if (this.gesture === 'pan') {
      this.pan(e.clientX - this.panLast.x, e.clientY - this.panLast.y);
      this.panLast = { x: e.clientX, y: e.clientY };
      return;
    }
    
    if (this.gesture === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const prev = this.pinchPrev;
      
      if (prev) {
        if (Math.abs(d - prev.d) > 4) {this.pinchMoved = true;}
        if (Math.hypot(cx - prev.cx, cy - prev.cy) > 3) {this.pinchMoved = true;}
        
        if (prev.d > 0) {
          const ratio = d / prev.d;
          if (Math.abs(ratio - 1) > 0.005) {
            this.zoomByRatio(ratio);
          }
        }
        
        const pdx = cx - prev.cx;
        const pdy = cy - prev.cy;
        if (Math.hypot(pdx, pdy) > 0.5) {
          this.pan(pdx, pdy);
        }
      }
      
      this.pinchPrev = { d, cx, cy };
      return;
    }
    
    if (this.gesture === 'tap' && this.clickPos) {
      if (Math.hypot(e.clientX - this.clickPos.x, e.clientY - this.clickPos.y) > 8) {
        this.gesture = 'drag';
        this.dragStart(this.clickPos.x, this.clickPos.y);
      }
    }
    
    if (this.gesture === 'drag') {
      this.drag(e.clientX, e.clientY);
    }
  }

  /**
   * Обрабатывает отпускание pointer
   * @param {PointerEvent} e
   * @returns {{type: string, pos?: object}} информация о жесте
   */
  handlePointerUp(e) {
    this.pointers.delete(e.pointerId);
    
    // Двухпальцевый тап — пауза
    if (this.gesture === 'pinch') {
      if (this.pointers.size === 0 && 
          !this.pinchMoved && 
          performance.now() - this.gestureStart < 350) {
        this.gesture = null;
        this.clickPos = null;
        this.dragEnd();
        return { type: 'two-finger-tap' };
      }
      
      if (this.pointers.size < 2) {
        this.gesture = null;
        this.clickPos = null;
        this.dragEnd();
        return { type: 'pinch-end' };
      }
      return null;
    }
    
    if (this.gesture === 'pan' && this.tapId === e.pointerId) {
      this.gesture = null;
      return { type: 'pan-end' };
    }
    
    if (this.gesture === 'drag' && this.tapId === e.pointerId) {
      this.dragEnd();
      this.gesture = null;
      return { type: 'drag-end' };
    }
    
    if (this.gesture === 'tap' && this.tapId === e.pointerId && this.clickPos) {
      this.dragEnd();
      const pos = { ...this.clickPos };
      this.gesture = null;
      this.clickPos = null;
      return { type: 'tap', pos };
    }
    
    if (this.pointers.size === 0) {
      this.gesture = null;
    }
    
    return null;
  }

  /**
   * Сбрасывает состояние контроллера
   */
  resetState() {
    this.pointers.clear();
    this.gesture = null;
    this.tapId = null;
    this.clickPos = null;
    this.clickMoved = false;
    this.pinchStart = 0;
    this.pinchMoved = false;
    this.pinchPrev = null;
    this.gestureStart = 0;
    this.panLast = null;
    this.dragging = false;
  }
}
