import simpleGit, { DefaultLogFields, LogResult, SimpleGit } from 'simple-git'
import type { Options, ParserOptions, WriterOptions } from 'conventional-changelog-core'
import * as writer from 'conventional-changelog-writer'
import * as parser from 'conventional-commits-parser'
// @ts-ignore
import angularPreset from 'conventional-changelog-angular'
import * as path from 'path'

import * as sicon from './sicon'

const withBase = (folderpath: string) => path.resolve(__dirname, folderpath)

const findTags = (git: SimpleGit) => async (tagPattern: string) => (await git.tags([
    '--sort=committerdate', '--list', tagPattern
])).all.reverse()

const findTag = (git: SimpleGit) => async (tagPattern: string): Promise<string | undefined> => (await findTags(git)(tagPattern))[0]
const isBehindRemote = async (git: SimpleGit) => {
    await git.remote(['update'])
    return (await git.status()).behind > 0
}
const createTag = (git: SimpleGit) => async (tag: string) => {
    await git.addTag(tag)
    return git.pushTags()
}
const createTagIfNotExists = (git: SimpleGit) => async (tag: string) => {
    const tags = await findTags(git)(tag)
    const tagExists = !!tags.find(t => t == tag)
    const isBehind = await isBehindRemote(git)
    if (!isBehind && !tagExists) return await createTag(git)(tag) && true
    return false
}

const getChangelog = (options: { parserOptions: ParserOptions, writerOptions: WriterOptions, version: string, messages: string[] }): string => {
    const parseLog = (log: string) => parser.sync(log, options.parserOptions)
    const parseLogs = (logs: string[]) => logs.map(parseLog)
    // @ts-ignore
    return writer.parseArray(parseLogs(options.messages), { version: options.version }, options.writerOptions)
}

const parseRefs = (refs: string) => refs
    .split(', ')
    .filter(ref => ref)
    .map(ref => ({
        type: ref.startsWith('tag: ') ? 'tag'
        : ref.includes('HEAD') ? 'ref'
        : 'branch',
        ref
    }))
    .map(ref => ({
        ...ref,
        ref: ref.type == 'tag' ? ref.ref.replace('tag: ', '') : ref.ref
    }))

const addParsedRefs = (logs: LogResult<DefaultLogFields>['all']) => logs.map(log => ({
    ...log,
    parsedRef: parseRefs(log.refs),
}))
const getLogs = (git: SimpleGit) => async (from: string | undefined, to: string) => {
    const logs = await git.log({
        from,
        to,
    })
    return addParsedRefs(logs.all)
}

const getNextVersion = (deps: { git: SimpleGit, sicon: typeof sicon }) => (branch: string, tag: string | undefined, bumpAmount: number) => {
    if (!tag) return deps.sicon.getVersionName(branch, '1')
    return deps.sicon.bumpTag(
        deps.sicon.getVersionPrefix(branch),
        deps.sicon.parseTag(deps.sicon.getVersionPrefix('master'), tag),
        bumpAmount
    )
}

interface Dependencies {
    git: SimpleGit
    sicon: typeof sicon
}

export type BranchVersionRules = Record<string, () => Promise<{
    lastTag: string | undefined
    nextTag: string
}>>

export const getInfo = (deps: Dependencies) => async (branch: string) => {
    const rules: BranchVersionRules = {
        master: async () => {
            const tagSearchPattern = deps.sicon.getVersionName(branch, '*')
            const lastTag = await findTag(deps.git)(tagSearchPattern)
            const nextTag = await getNextVersion(deps)(branch, lastTag, 1)
            return {
                lastTag,
                nextTag,
            }
        },
        beta: async () => {
            const lastTag = await findTag(deps.git)('m-*')
            const nextTag = await getNextVersion(deps)(branch, lastTag, 0)
            return {
                lastTag,
                nextTag,
            }
        },
        release: async () => {
            const lastTag = await findTag(deps.git)('b-*')
            const nextTag = await getNextVersion(deps)(branch, lastTag, 0)
            return {
                lastTag,
                nextTag,
            }
        },
    }
    const { lastTag, nextTag } = await (rules[branch] || rules.master)()
    const preset: { conventionalChangelog: Required<Options.Config.Object> } = await angularPreset
    const logs = await getLogs(git)(lastTag || 'HEAD~1', 'HEAD')
    const changelog = getChangelog({
        parserOptions: preset.conventionalChangelog.parserOpts,
        writerOptions: {
            ...preset.conventionalChangelog.writerOpts,
            groupBy: 'type',
            // commitGroupsSort: 'title',
            // commitsSort: ['scope', 'subject'],
            noteGroupsSort: 'title',
            commitPartial: '* {{header}}\n',
            headerPartial: '## {{version}}',
        },
        version: nextTag,
        messages: logs.map(l => l.message),
    })
    return { lastTag, nextTag, changelog }
}

export const publish = (deps: Dependencies) => async (tag: string) => {
    return await createTagIfNotExists(deps.git)(tag)
}

const git = simpleGit(withBase('.'))
const deps = { git, sicon }

export default {
    getInfo: getInfo(deps),
    publish: publish(deps),
}
