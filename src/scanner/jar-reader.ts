import { openPromise } from "yauzl";

const MANIFEST_ENTRY_NAME = "META-INF/MANIFEST.MF";
const MAX_MANIFEST_BYTES = 1024 * 1024;

export class JarReadError extends Error {
  override readonly name = "JarReadError";

  constructor(
    readonly jarPath: string,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(`Could not read JAR ${jarPath}: ${reason}`, options);
  }
}

/** Read only the manifest entry; archive contents are never extracted or modified. */
export async function readJarManifest(
  jarPath: string,
): Promise<Buffer | undefined> {
  let archive: Awaited<ReturnType<typeof openPromise>> | undefined;

  try {
    archive = await openPromise(jarPath, {
      autoClose: false,
      lazyEntries: true,
      validateEntrySizes: true,
    });

    for await (const entry of archive.eachEntry()) {
      if (entry.fileName.toUpperCase() !== MANIFEST_ENTRY_NAME) {
        continue;
      }

      if (entry.uncompressedSize > MAX_MANIFEST_BYTES) {
        throw new Error(`manifest exceeds ${MAX_MANIFEST_BYTES} bytes`);
      }

      const stream = await archive.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > MAX_MANIFEST_BYTES) {
          stream.destroy();
          throw new Error(`manifest exceeds ${MAX_MANIFEST_BYTES} bytes`);
        }
        chunks.push(buffer);
      }

      return Buffer.concat(chunks, totalBytes);
    }

    return undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new JarReadError(jarPath, reason, { cause: error });
  } finally {
    archive?.close();
  }
}
