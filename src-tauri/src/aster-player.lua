local utils = require 'mp.utils'
local position, duration = 0, 0
mp.observe_property('time-pos', 'number', function(_, value) if value then position = value end end)
mp.observe_property('duration', 'number', function(_, value) if value then duration = value end end)
local function report()
    if duration > 0 then
        io.stdout:write('ASTER_PROGRESS ' .. utils.format_json({position=position, duration=duration}) .. '\n')
        io.stdout:flush()
    end
end
mp.add_periodic_timer(1, report)
mp.register_event('end-file', function(event)
    report()
    if event.reason == 'eof' then
        io.stdout:write('ASTER_COMPLETE\n')
        io.stdout:flush()
    end
end)
mp.register_event('shutdown', report)
mp.add_key_binding('Ctrl+a', 'aster-audio-menu', function() mp.commandv('script-binding', 'select/select-aid') end)
mp.add_key_binding('Ctrl+s', 'aster-subtitle-menu', function() mp.commandv('script-binding', 'select/select-sid') end)
local function state()
    local tracks = {}
    for _, track in ipairs(mp.get_property_native('track-list', {})) do
        if track.type == 'audio' or track.type == 'sub' then
            table.insert(tracks, {id=track.id, type=track.type, lang=track.lang or '', title=track.title or '', codec=track.codec or '', selected=track.selected or false})
        end
    end
    io.stdout:write('ASTER_STATE ' .. utils.format_json({paused=mp.get_property_native('pause', false), volume=mp.get_property_number('volume', 100), muted=mp.get_property_native('mute', false), tracks=tracks}) .. '\n')
    io.stdout:flush()
end
for _, name in ipairs({'track-list', 'pause', 'volume', 'mute', 'aid', 'sid'}) do mp.observe_property(name, 'native', state) end
mp.register_event('file-loaded', state)
local function input(action)
    io.stdout:write('ASTER_INPUT ' .. utils.format_json({action=action}) .. '\n')
    io.stdout:flush()
end
-- Physical pointer activity comes from the native host. Resizing the video
-- changes mouse-pos without a real movement and must not reveal idle controls.
mp.add_key_binding('f', 'aster-fullscreen', function() input('fullscreen') end)
mp.add_key_binding('ESC', 'aster-escape', function() input('escape') end)
mp.add_key_binding('SPACE', 'aster-pause', function() mp.commandv('cycle', 'pause') end)
mp.add_key_binding('LEFT', 'aster-seek-back', function() mp.commandv('seek', -10, 'relative'); input('activity') end, {repeatable=true})
mp.add_key_binding('RIGHT', 'aster-seek-forward', function() mp.commandv('seek', 10, 'relative'); input('activity') end, {repeatable=true})
local function volume(delta)
    mp.set_property_number('volume', math.max(0, math.min(100, mp.get_property_number('volume', 100) + delta)))
    input('activity')
end
mp.add_key_binding('UP', 'aster-volume-up', function() volume(5) end, {repeatable=true})
mp.add_key_binding('DOWN', 'aster-volume-down', function() volume(-5) end, {repeatable=true})
mp.add_key_binding('m', 'aster-mute', function() mp.commandv('cycle', 'mute'); input('activity') end)
mp.add_key_binding('TAB', 'aster-controls', function() input('activity') end)
