import { promises as fs } from 'fs'
import path from 'path'
import { isEmptyObject, isString } from '@intlify/shared'
import { createFilter } from '@rollup/pluginutils'
import { generateJSON, generateYAML } from '@intlify/cli'
import { debug as Debug } from 'debug'
import { parseVueRequest } from './query'

import type { CodeGenOptions, DevEnv } from '@intlify/cli'
import type { VitePluginVueI18nOptions } from './options'

const debug = Debug('vite-plugin-vue-i18n:transform')

export function transform(
  options: VitePluginVueI18nOptions = { forceStringify: false }
) {
  debug('transform NODE_ENV', process.env.NODE_ENV)
  const filter = createFilter(options.include)
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    async transform(code: string, id: string) {
      const { filename, query } = parseVueRequest(id)
      debug('transform', id, code, JSON.stringify(query))

      const parseOptions = getOptions(
        filename,
        isProduction,
        query as Record<string, unknown>,
        options.forceStringify
      ) as CodeGenOptions
      debug('parseOptions', parseOptions)

      let langInfo = 'json'
      if (!query.vue) {
        if (/\.(json5?|ya?ml)$/.test(id) && filter(id)) {
          langInfo = path.parse(filename).ext
          // NOTE:
          // `.json` is handled default in vite, and it's transformed to JS object.
          let _source = code
          if (langInfo === '.json') {
            _source = await getRawJSON(id)
          }
          const generate = /\.?json5?/.test(langInfo)
            ? generateJSON
            : generateYAML
          const { code: generatedCode } = generate(_source, parseOptions)
          debug('generated code', generatedCode)
          // TODO: error handling & sourcempa
          return Promise.resolve(generatedCode)
        } else {
          return Promise.resolve(code)
        }
      } else {
        // for Vue SFC
        if (isCustomBlock(query as Record<string, unknown>)) {
          if ('src' in query) {
            if (isString(query.lang)) {
              langInfo = query.lang === 'i18n' ? 'json' : query.lang
            }
          } else {
            if (isString(query.lang)) {
              langInfo = query.lang
            }
          }
        }
        const generate = /\.?json5?/.test(langInfo)
          ? generateJSON
          : generateYAML
        const { code: generatedCode } = generate(code, parseOptions)
        debug('generated code', generatedCode)
        // TODO: error handling & sourcempa
        return Promise.resolve(generatedCode)
      }
    }
  }
}

async function getRawJSON(path: string): Promise<string> {
  return fs.readFile(path, { encoding: 'utf-8' })
}

function isCustomBlock(query: Record<string, unknown>): boolean {
  // NOTE: should be more improvement. difference query type and blocktype in some environment ...
  return (
    !isEmptyObject(query) &&
    'vue' in query &&
    (query['type'] === 'custom' ||
      query['type'] === 'i18n' ||
      query['blockType'] === 'i18n')
  )
}

function getOptions(
  filename: string,
  isProduction: boolean,
  query: Record<string, unknown>,
  forceStringify = false
): Record<string, unknown> {
  const mode: DevEnv = isProduction ? 'production' : 'development'

  const baseOptions = {
    filename,
    forceStringify,
    env: mode as DevEnv,
    onWarn: (msg: string): void => {
      console.warn(`[vite-plugin-vue-i18n]: ${filename} ${msg}`)
    },
    onError: (msg: string): void => {
      console.error(`[vite-plugin-vue-i18n]: ${filename} ${msg}`)
    }
  }

  if (isCustomBlock(query)) {
    return Object.assign(baseOptions, {
      type: 'sfc',
      locale: isString(query.locale) ? query.locale : '',
      isGlobal: query.global != null
    })
  } else {
    return Object.assign(baseOptions, {
      type: 'plain',
      isGlobal: false
    })
  }
}