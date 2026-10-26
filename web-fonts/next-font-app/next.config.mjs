// Static export so the build output is plain HTML, CSS and font files that
// sit next to the full-* folders on the same deploy. build.mjs sets NF_VARIANT.
const variant = process.env.NF_VARIANT ?? 'next-font';
export default { output: 'export', basePath: `/${variant}`, trailingSlash: true };
