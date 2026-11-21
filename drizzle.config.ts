// drizzle-kit is not installed (it is only needed to write migrations, and it made every Cloudflare build
// install ~60 more packages). `npm run db:generate` runs it with npx.
const config = {
  schema: "./db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
};

export default config;
