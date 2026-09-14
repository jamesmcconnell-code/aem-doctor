#!/usr/bin/env node

import { createProgram } from "./create-program.js";

await createProgram().parseAsync(process.argv);
