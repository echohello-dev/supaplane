const GIT_ENV_PREFIX = "GIT_";

for (const key of Object.keys(process.env)) {
  if (key.startsWith(GIT_ENV_PREFIX)) {
    delete process.env[key];
  }
}
