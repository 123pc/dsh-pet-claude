"""Build anticipation, takeoff, airborne arm opening and cushioned landing."""
import json
import whole_character_animation as pipeline


def main():
    takeoff_lifts=[0,0,0,0,0,3,13,26,38,44,44,34]
    landing_lifts=[0,15,6,0,0,0,0,0,0,0,0,0]
    takeoff=pipeline.register('jump-takeoff',rows=3,lifts=takeoff_lifts)
    landing=pipeline.register('jump-landing',rows=3,scale_anchor=11,lifts=landing_lifts)
    closing=pipeline.register('happy-open-arms',rows=3)
    sequence=[(takeoff[i-1],2 if i<=4 else 1) for i in [1,2,3,4,5,6,7,8,10,11,9,12]]
    # The first landing drawing is an unused pose exploration; start with the
    # descending in-between that connects to the airborne knee extension.
    sequence += [(landing[i-1],1 if i<=4 else 2) for i in range(2,10)]
    sequence += [(landing[8],24)]
    sequence += [(path,2) for path in closing[::-1]]
    result=pipeline.encode('happy',timed_frames=sequence,revision=2,
        finish_hold_sec=1,drawing_fps=24)
    result['airborneShoeClearancePx']={'jump-takeoff':takeoff_lifts,'jump-landing':landing_lifts}
    result['poster']={'sheet':'jump-takeoff','frame':10}
    result['phases']=['anticipation','takeoff','airborne-open-arms','descent','landing-compression','standing-smile','return']
    result['returnDrawingFps']=12
    metadata={'method':'built-in imagegen whole-character keyframes','fps':24,'drawingFps':24,
        'gesture':'jump first, then open arms while airborne; one cushioned landing, no dance','actions':[result]}
    pipeline.write(pipeline.SOURCE/'choreography.json',metadata)
    path=pipeline.PACK/'sources/reference-actions/choreography.json'
    previous=json.loads(path.read_text(encoding='utf8'))
    previous['actions']=[a for a in previous['actions'] if a['id'] in ['salute','breeze']]+[result]
    previous.pop('rejected',None)
    previous.pop('acceptedByUser',None)
    previous.pop('references',None)
    previous.pop('danceRevision',None)
    pipeline.write(path,previous)


if __name__=='__main__':main()
