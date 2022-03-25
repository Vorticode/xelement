@echo off
rem This batch file uses denopack to bundle and minify all SiteCrafter files into a single SiteCrafter.min.js file,
rem along with a source map.
rem Install denopack with:  deno run --allow-run --allow-read https://deno.land/x/denopack@0.9.0/install.ts

rem deno eval --unstable "import {existsSync } from 'https://deno.land/std/fs/mod.ts'; if (!existsSync('cache.json')) Deno.writeTextFileSync('cache.json', '{}');"

rem Denopack stops the batch file if we don't precede it with call.
call denopack -i ../src/XElement.js -o "../dist/XElement.min.js"

rem Deno won't put the files in another folder
rem >nul to suppress printing on every move command.

rem move main.min.js ../js/main.min.js >nul
rem move main.min.js.map ../js/main.min.js.map >nul

rem Deno has a bug where it writes the wrong source mapping command, so we replace it in the output.
rem deno eval "Deno.writeTextFileSync('../js/main.min.js', Deno.readTextFileSync('../js/main.min.js').replace(/sourceMappingUrl=/, 'sourceMappingURL='));"


