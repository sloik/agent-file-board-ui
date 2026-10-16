use framework "Foundation"
use scripting additions

-- No commands or application names are accepted from the URL.
on guidancePath(rawURL)
    set parts to current application's NSURLComponents's componentsWithString:rawURL
    if parts is missing value then error "Invalid guidance URL"
    if (parts's |scheme|() as text) is not "agent-file-board" then error "Invalid scheme"
    if (parts's |host|() as text) is not "open" then error "Invalid action"
    if parts's |query|() is not missing value or parts's fragment() is not missing value or parts's |user|() is not missing value or parts's |port|() is not missing value then error "Unexpected URL fields"
    set decodedPath to parts's |path|()
    if decodedPath is missing value then error "Missing path"
    set cleanPath to decodedPath's stringByStandardizingPath()
    if (cleanPath as text) is not (decodedPath as text) then error "Use an absolute normalized path"
    set pattern to "^/[^[:cntrl:]]+/(?:GUIDANCE[.]md|topics/T[0-9]+[.]md)$"
    set matchRange to cleanPath's rangeOfString:pattern options:(current application's NSRegularExpressionSearch)
    if matchRange's |length| is 0 then error "Only board guidance Markdown files can be opened"
    set parentPath to cleanPath's stringByDeletingLastPathComponent()
    if (parentPath's lastPathComponent() as text) is "topics" then set parentPath to parentPath's stringByDeletingLastPathComponent()
    set dataPath to (parentPath's stringByDeletingLastPathComponent())'s stringByDeletingLastPathComponent()
    set manager to current application's NSFileManager's defaultManager()
    if not (manager's fileExistsAtPath:(dataPath's stringByAppendingPathComponent:"config.json")) then error "This is not a board data folder"
    if not (manager's fileExistsAtPath:(dataPath's stringByAppendingPathComponent:"participants.json")) then error "This is not a registered board"
    -- Allow a symlink to the board root, but never follow one inside the board
    -- to a different file or application outside the requested guidance path.
    set relativePath to cleanPath's substringFromIndex:((dataPath's |length|()) + 1)
    set resolvedRoot to dataPath's stringByResolvingSymlinksInPath()
    set expectedPath to resolvedRoot's stringByAppendingPathComponent:relativePath
    if (cleanPath's stringByResolvingSymlinksInPath() as text) is not (expectedPath as text) then error "Guidance symlinks are not supported"
    set target to (cleanPath as text)
    -- Resolving as an alias refuses missing files; Open never creates guidance.
    set existingFile to (POSIX file target) as alias
    set fileInfo to info for existingFile
    if folder of fileInfo then error "Guidance must be a file"
    return target
end guidancePath

on open location rawURL
    try
        set target to my guidancePath(rawURL)
        do shell script "/usr/bin/open " & quoted form of target
    on error messageText
        display alert "Cannot open board guidance" message messageText
    end try
end open location
