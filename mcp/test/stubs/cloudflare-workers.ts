// Node stand-in for the Workers runtime module the OAuth provider imports.
export class WorkerEntrypoint {
  constructor(
    public ctx: unknown,
    public env: unknown,
  ) {}
}
