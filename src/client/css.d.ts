// A minimal ambient declaration for CSS imports: esbuild's text loader turns
// each import into the file's string content at build time.
declare module '*.css' {
    const content: string;
    export default content;
}
