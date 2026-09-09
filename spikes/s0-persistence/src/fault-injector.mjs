export class InjectedFaultError extends Error {
  constructor(point) {
    super(`Injected fault at ${point}`);
    this.name = "InjectedFaultError";
    this.code = "injected_fault";
    this.point = point;
  }
}

export class FaultInjector {
  constructor(points = []) {
    this.points = new Set(points);
    this.hits = [];
  }

  hit(point) {
    this.hits.push(point);
    if (this.points.has(point)) throw new InjectedFaultError(point);
  }
}
