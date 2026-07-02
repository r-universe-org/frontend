import crypto from 'node:crypto';

/* Cloudflare R2 (CDN) config, see actions/deploy-packages/deploy-r2.sh.
   Credentials are read from the same AWS_* envvars as the aws cli. */
const R2_ENDPOINT = process.env.R2_ENDPOINT || 'https://3fcdf4a2e34a7a2e74fc8686b68acea1.r2.cloudflarestorage.com';
const R2_BUCKET = process.env.R2_BUCKET || 'r-universe-cdn';
const R2_PUBLIC_HOST = 'r2.ropensci.org';
const R2_REGION = 'auto';

function hmac_sha256(key, str){
  return crypto.createHmac('sha256', key).update(str).digest();
}

function sha256_hex(str){
  return crypto.createHash('sha256').update(str).digest('hex');
}

/* Delete a single object from the R2 bucket using a hand-rolled AWS SigV4
   signed DELETE request (R2 is S3-compatible). The object key is the sha256
   that forms the last path segment of the public download url. */
function delete_from_r2(key){
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if(!accessKeyId || !secretAccessKey){
    throw new Error("Cannot delete from CDN: missing R2 AWS credentials");
  }
  const endpoint = new URL(R2_ENDPOINT);
  const host = endpoint.host;
  const canonicalUri = `/${R2_BUCKET}/${encodeURIComponent(key)}`;
  const amzdate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); //YYYYMMDDTHHMMSSZ
  const datestamp = amzdate.slice(0, 8);
  const payloadHash = sha256_hex(''); //empty body
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzdate}\n`;
  const canonicalRequest = ['DELETE', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${datestamp}/${R2_REGION}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzdate, scope, sha256_hex(canonicalRequest)].join('\n');
  const kDate = hmac_sha256('AWS4' + secretAccessKey, datestamp);
  const kRegion = hmac_sha256(kDate, R2_REGION);
  const kService = hmac_sha256(kRegion, 's3');
  const kSigning = hmac_sha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(`${endpoint.origin}${canonicalUri}`, {
    method: 'DELETE',
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzdate,
      'Authorization': authorization
    },
    signal: AbortSignal.timeout(30000)
  }).then(function(res){
    //R2 returns 204 on success and also 204 when the object is already gone.
    if(!res.ok && res.status !== 404){
      return res.text().then(function(body){
        throw new Error(`Failed to delete ${key} from R2 (HTTP ${res.status}): ${body}`);
      });
    }
    console.log(`Deleted file ${key} from CDN`);
  });
}

// Files in R2 will automatically expire after 100 days but we can save some space by
// immediately deleting replaced files. However we should NOT delete things when running tests!
export function delete_from_cdn(url){
  if(process.env.DELETE_FROM_R2) {
    const host = new URL(url).host;
    if(host !== R2_PUBLIC_HOST){
      console.log(`Not deleting file on unrecognized CDN host: ${url}`);
      return;
    }
    const key = new URL(url).pathname.replace(/^\//, '');

    // Try to cleanup old file from CDN but not critical if it errors
    return delete_from_r2(key).catch(err => console.log(err));
  }
}
