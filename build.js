const esbuild = require('esbuild');
const { copy } = require('esbuild-plugin-copy');
const isWatch = process.argv.includes('--watch');
const isServe = process.argv.includes('--serve');
const isLib = process.argv.includes('--lib');

// Build options for the full app
const appBuildOptions = {
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'dist/assets/js/bundle.js',
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
    loader: {
        '.css': 'text'
    },
    logLevel: 'info',
    plugins: [
        copy({
        resolveFrom: 'cwd',
            assets: [
                {
                    from: ['src/assets/images/*'],
                    to: ['dist/assets/images'],
                },
                {
                    from: ['index.html'],
                    to: ['dist/index.html'],
                }
            ],
        }),
    ]
};

// Build options for the library bundle (IIFE format)
const libBuildOptions = {
    entryPoints: ['src/lib.ts'],
    bundle: true,
    outfile: 'dist/sprotty.js',
    platform: 'browser',
    format: 'iife', // IIFE format for browser globals
    globalName: '_SprottyModule', // Internal module name
    target: 'es2020',
    sourcemap: true,
    minify: false, // Set to true for production
    loader: {
        '.css': 'text'
    },
    logLevel: 'info',
    external: [], // Bundle all dependencies
    banner: {
        js: '// Sprotty Diagram Library\n'
    }
};

async function build() {
    try {
        if (isLib) {
            // Build library bundle
            await esbuild.build(libBuildOptions);
            console.log('✅ Library build complete! Output: dist/sprotty.js');
            
            // Also build minified version
            await esbuild.build({
                ...libBuildOptions,
                outfile: 'dist/sprotty.min.js',
                minify: true,
                sourcemap: false
            });
            console.log('✅ Minified library build complete! Output: dist/sprotty.min.js');
        } else {
            // Build app
            if (isWatch) {
                const ctx = await esbuild.context(appBuildOptions);
                await ctx.watch();
                console.log('👀 Watching for changes...');
                
                if (isServe) {
                    await ctx.serve({
                        servedir: 'dist',
                        port: 8090,
                        host: '0.0.0.0'
                    });
                    console.log('🚀 Server running at http://localhost:8090');
                }
            } else {
                await esbuild.build(appBuildOptions);
                console.log('✅ Build complete!');
            }
        }
    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

build();
