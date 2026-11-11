export interface FieldError {
  in?: string;
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    readonly errors: FieldError[] = [],
  ) {
    super(400, message);
  }
}
