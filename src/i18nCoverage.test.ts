import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { translateNow } from './runtimeI18n'

const HAN = /[\p{Script=Han}]/u
const sourceRoot = join(process.cwd(), 'src')
const localeCatalogs = new Set([
  'i18n.ts',
  'runtimeI18n.ts',
  'features/help/HelpDialog.tsx'
])

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(name) || /\.test\.[jt]sx?$/.test(name)) return []
    return [path]
  })
}

function isDefineMessagesCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineMessages'
}

function insideDefineMessages(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (isDefineMessagesCall(current)) return true
  }
  return false
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
}

describe('static i18n coverage', () => {
  it('keeps rendered component copy behind structured message keys', () => {
    const uncovered: string[] = []

    for (const path of sourceFiles(sourceRoot).filter(path => path.endsWith('.tsx'))) {
      const localPath = relative(sourceRoot, path).replaceAll('\\', '/')
      if (localeCatalogs.has(localPath)) continue
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

      const visit = (node: ts.Node) => {
        const value = ts.isJsxText(node)
          ? node.getText(source).trim()
          : ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
            ? node.text
            : null
        if (value && HAN.test(value) && !insideDefineMessages(node)) {
          uncovered.push(`${localPath}:${lineOf(source, node)} ${JSON.stringify(value)}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }

    expect(uncovered, `Unkeyed UI copy:\n${uncovered.join('\n')}`).toEqual([])
  })

  it('has an English translation for every structured Chinese source message', () => {
    const untranslated: string[] = []

    for (const path of sourceFiles(sourceRoot)) {
      const localPath = relative(sourceRoot, path).replaceAll('\\', '/')
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const visit = (node: ts.Node) => {
        if (isDefineMessagesCall(node)) {
          const object = node.arguments[0]
          if (object && ts.isObjectLiteralExpression(object)) {
            for (const property of object.properties) {
              if (!ts.isPropertyAssignment(property)) continue
              const initializer = property.initializer
              if (!ts.isStringLiteral(initializer) && !ts.isNoSubstitutionTemplateLiteral(initializer)) continue
              if (!HAN.test(initializer.text)) continue
              const translated = translateNow(initializer.text, 'en-US')
              if (HAN.test(translated)) {
                untranslated.push(`${localPath}:${lineOf(source, initializer)} ${JSON.stringify(initializer.text)} -> ${JSON.stringify(translated)}`)
              }
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }

    expect(untranslated, `Missing English structured copy:\n${untranslated.join('\n')}`).toEqual([])
  })

  it('does not restore DOM text mutation translation', () => {
    const forbidden: string[] = []
    for (const path of sourceFiles(sourceRoot)) {
      const source = readFileSync(path, 'utf8')
      if (/\bMutationObserver\b|\buseRuntimeI18n\b/.test(source)) {
        forbidden.push(relative(sourceRoot, path).replaceAll('\\', '/'))
      }
    }
    expect(forbidden).toEqual([])
  })
})
