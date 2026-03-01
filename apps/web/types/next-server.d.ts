/**
 * Fallback type declarations for next/server when the IDE/TS server
 * does not resolve node_modules/next types. Next.js provides these at runtime.
 */
declare module "next/server" {
  export class NextRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit);
    readonly nextUrl: URL;
    readonly cookies: {
      get: (name: string) => { name: string; value: string } | undefined;
      getAll: () => { name: string; value: string }[];
      has: (name: string) => boolean;
      set: (name: string, value: string, options?: object) => void;
      delete: (name: string) => void;
    };
  }

  export class NextResponse extends Response {
    readonly cookies: {
      set: (name: string, value: string, options?: object) => void;
      get: (name: string) => { name: string; value: string } | undefined;
      getAll: () => { name: string; value: string }[];
      delete: (name: string) => void;
    };
    static redirect(url: string | URL, status?: number): NextResponse;
    static next(config?: { request?: RequestInit }): NextResponse;
    static json(body: unknown, init?: ResponseInit): NextResponse;
    static rewrite(url: string | URL, init?: ResponseInit): NextResponse;
  }
}
