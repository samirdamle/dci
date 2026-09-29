import {
  ERROR_CODES,
  isSupportedVersion,
  PROTOCOL_VERSION,
  validateRequest,
  type DciRequest,
} from '@dci/protocol';
import { DciRequestError } from './errors';

/**
 * Read and validate a DCI request. Throws `DciRequestError`: 405 for a
 * non-POST, 415 for a non-JSON body, 400 for invalid JSON or fields, and
 * 400 with code `unsupported_version` for an unknown protocol version.
 */
export async function parseDciRequest(request: Request): Promise<DciRequest> {
  if (request.method !== 'POST') {
    throw new DciRequestError('DCI requests must use POST', 405, 'method_not_allowed');
  }
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new DciRequestError(
      'Content-Type must be application/json',
      415,
      'unsupported_media_type',
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    throw new DciRequestError('Request body is not valid JSON', 400, ERROR_CODES.badRequest);
  }
  const result = validateRequest(body);
  if (!result.ok) {
    throw new DciRequestError('Invalid DCI request', 400, ERROR_CODES.badRequest, result.issues);
  }
  if (!isSupportedVersion(result.value.v)) {
    throw new DciRequestError(
      `Unsupported protocol version ${result.value.v} (server speaks ${PROTOCOL_VERSION})`,
      400,
      ERROR_CODES.unsupportedVersion,
    );
  }
  return result.value;
}
