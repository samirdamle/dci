/** A request DCI can't handle; `status` is the HTTP status to answer with. */
export class DciRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'DciRequestError';
  }
}
