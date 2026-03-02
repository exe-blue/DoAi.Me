declare module "archiver" {
  const archiver: (format: string, options?: object) => {
    pipe: (target: NodeJS.WritableStream) => void;
    append: (source: string | Buffer, options?: { name?: string }) => void;
    file: (path: string, options?: { name?: string }) => void;
    finalize: () => void;
    on: (event: string, cb: (err?: Error) => void) => void;
  };
  export default archiver;
}
