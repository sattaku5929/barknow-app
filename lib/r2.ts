import { S3Client } from "@aws-sdk/client-s3";

export const R2_ENVIRONMENT_VARIABLES = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
] as const;

export class R2ConfigurationError extends Error {
  missing: string[];

  constructor(missing: string[]) {
    super(`R2 configuration is missing: ${missing.join(", ")}`);
    this.name = "R2ConfigurationError";
    this.missing = missing;
  }
}

function configured(name: (typeof R2_ENVIRONMENT_VARIABLES)[number]) {
  return process.env[name]?.trim() ?? "";
}

function required(name: (typeof R2_ENVIRONMENT_VARIABLES)[number]) {
  const value = configured(name);
  if (!value) throw new R2ConfigurationError([name]);
  return value;
}

export function assertR2Configuration() {
  const missing = R2_ENVIRONMENT_VARIABLES.filter((name) => !configured(name));
  if (missing.length) throw new R2ConfigurationError([...missing]);
}

export function r2Client() {
  assertR2Configuration();
  return new S3Client({
    region: "auto",
    endpoint: required("R2_ENDPOINT"),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export function r2BucketName() {
  return required("R2_BUCKET_NAME");
}

export function r2PublicUrl() {
  return required("R2_PUBLIC_URL").replace(/\/$/, "");
}
