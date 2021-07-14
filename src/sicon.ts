
import { differenceInCalendarWeeks, startOfYear, getYear } from 'date-fns'
import escapeRegExp from 'lodash.escaperegexp'

const getWeekReleaseCalendarWeekDistance = (releaseWeekDistance: number, sprintLengthWeeks: number, calendarWeek: number) =>
    releaseWeekDistance - (calendarWeek % sprintLengthWeeks)
const getReleaseCalendarWeek = (releaseWeekDistance: number, sprintLengthWeeks: number, calendarWeek: number) =>
    calendarWeek + getWeekReleaseCalendarWeekDistance(releaseWeekDistance, sprintLengthWeeks, calendarWeek)
const getCurrentCalendarWeek = () =>
    differenceInCalendarWeeks(new Date(), startOfYear(new Date()))
const getCurrentYear = () => getYear(new Date())
const getVersionPrefixByRules = (prefixRules: Record<string, string>) => (branch: string) =>
    prefixRules[branch] == undefined ? branch + '-' : prefixRules[branch]
export const getVersionPrefix = getVersionPrefixByRules({
    master: 'm-',
    beta: 'b-',
    release: '',
})

export const getVersionName = (branch: string, version: string) =>
    `${getVersionPrefix(branch)}${getCurrentYear()}.${getReleaseCalendarWeek(4, 2, getCurrentCalendarWeek())}.${version}`

export const parseTag = (versionPrefix: string, tag: string) => {
    const match = tag.match(escapeRegExp(versionPrefix) + '((\\d{4,})\\.(\\d{2})\\.(\\d+))')
    if (!match) return {}
    return {
        tag: match[0],
        version: match[1],
        year: parseInt(match[2]),
        calendarWeek: parseInt(match[3]),
        number: parseInt(match[4])
    }
}
export const bumpTag = (versionPrefix: string, tagObject: ReturnType<typeof parseTag>, amount: number) => `${versionPrefix}${tagObject.year}.${tagObject.calendarWeek}.${(tagObject.number || 0) + amount}`


export const getReleaseToAdd = async (tags: string[], branch: string) => {
    // const tags = await getTags(branch, { cwd: context.cwd, env: context.env })
    const versionPrefix = getVersionPrefix(branch)
    const validTags = tags
        .map(t => parseTag(versionPrefix, t))
        .filter(Boolean)
        .reverse()
    const lastReleaseTag = validTags[0] || {
        tag: ''
    }
    return lastReleaseTag
}

// export const getTag = (commits: LogResult<DefaultLogFields>['all'], branch: string) => {
//     const versionPrefix = getVersionPrefix(branch)
//     const lastRelease = commits.find(commit => commit.gitTags.includes(' ' + versionPrefix))
//     if (!lastRelease) return getVersionName(branch, '1')
//     const [, lastTag] = lastRelease.gitTags.match('(' + escapeRegExp(versionPrefix) + '.*)[,\)]')
//     if (!lastTag) return
//     const newTag = bumpTag(versionPrefix, parseTag(versionPrefix, branch + '.' + lastTag))
//     return newTag
// }