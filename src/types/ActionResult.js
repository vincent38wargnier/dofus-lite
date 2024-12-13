export class ActionResult {
  constructor(success, type, changes = {}, error = null) {
    this.success = success;
    this.type = type;
    this.changes = changes;
    this.error = error;
  }
} 