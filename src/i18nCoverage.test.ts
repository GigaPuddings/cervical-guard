import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

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

function stringProperty(object: ts.ObjectLiteralExpression, name: string): ts.StringLiteral | undefined {
  const property = object.properties.find(
    item => ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === name
  )
  return property && ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)
    ? property.initializer
    : undefined
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

  it('keeps every structured message a complete zh/en pair', () => {
    const incomplete: string[] = []

    for (const path of sourceFiles(sourceRoot)) {
      const localPath = relative(sourceRoot, path).replaceAll('\\', '/')
      if (localeCatalogs.has(localPath)) continue
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const visit = (node: ts.Node) => {
        if (isDefineMessagesCall(node)) {
          const object = node.arguments[0]
          if (object && ts.isObjectLiteralExpression(object)) {
            for (const property of object.properties) {
              if (!ts.isPropertyAssignment(property)) continue
              const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : '<key>'
              const value = property.initializer
              const pair = ts.isObjectLiteralExpression(value) ? value : undefined
              const zh = pair ? stringProperty(pair, 'zh') : undefined
              const en = pair ? stringProperty(pair, 'en') : undefined
              if (!pair || !zh || !en || !zh.text.trim() || !en.text.trim() || HAN.test(en.text)) {
                incomplete.push(
                  `${localPath}:${lineOf(source, property)} ${JSON.stringify(key)} -> ${pair ? `zh=${zh ? JSON.stringify(zh.text) : 'missing'} en=${en ? JSON.stringify(en.text) : 'missing'}` : 'not a {zh, en} literal'}`
                )
              }
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }

    expect(incomplete, `Incomplete zh/en message pairs:\n${incomplete.join('\n')}`).toEqual([])
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
