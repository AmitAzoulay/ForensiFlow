import React, { useState, useEffect, useRef, useCallback } from 'react';
import './TimelineFilter.css';

interface TimelineFilterProps {
    minTime: number;
    maxTime: number;
    startTime: number;
    endTime: number;
    onChange: (start: number, end: number) => void;
}

const TimelineFilter: React.FC<TimelineFilterProps> = ({ minTime, maxTime, startTime, endTime, onChange }) => {
    const [minVal, setMinVal] = useState(startTime);
    const [maxVal, setMaxVal] = useState(endTime);
    const range = useRef<HTMLDivElement>(null);

    const formatTime = (timestamp: number) => {
        const d = new Date(timestamp);
        return d.toLocaleString(undefined, {
            month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    const getPercent = useCallback(
        (value: number) => Math.round(((value - minTime) / (maxTime - minTime)) * 100),
        [minTime, maxTime]
    );

    useEffect(() => {
        setMinVal(startTime);
        setMaxVal(endTime);
    }, [startTime, endTime]);

    useEffect(() => {
        if (range.current) {
            const minPercent = getPercent(minVal);
            const maxPercent = getPercent(maxVal);
            range.current.style.left = `${minPercent}%`;
            range.current.style.width = `${maxPercent - minPercent}%`;
        }
    }, [minVal, maxVal, getPercent]);

    const handleMinChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = Math.min(Number(event.target.value), maxVal - 1);
        setMinVal(value);
        onChange(value, maxVal);
    };

    const handleMaxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = Math.max(Number(event.target.value), minVal + 1);
        setMaxVal(value);
        onChange(minVal, value);
    };

    if (minTime === maxTime) {
        return null;
    }

    return (
        <div className="timeline-container compact">
            <div className="multi-range-slider">
                <input
                    type="range"
                    min={minTime}
                    max={maxTime}
                    value={minVal}
                    onChange={handleMinChange}
                    className="thumb thumb-left"
                    style={{ zIndex: minVal > maxTime - 100 ? "5" : "3" }}
                    title={`From: ${formatTime(minVal)}`}
                />
                <input
                    type="range"
                    min={minTime}
                    max={maxTime}
                    value={maxVal}
                    onChange={handleMaxChange}
                    className="thumb thumb-right"
                    title={`To: ${formatTime(maxVal)}`}
                />
                <div className="slider">
                    <div className="slider__track" />
                    <div ref={range} className="slider__range" />
                </div>
            </div>
            
            {/* פתרון 1: הצגת הטווח הנבחר במקום זמני הקצה הסטטיים */}
            <div className="timeline-labels">
                <span className="selected-time-active">{formatTime(minVal)}</span>
                <span className="selected-time-active">{formatTime(maxVal)}</span>
            </div>
        </div>
    );
};

export default TimelineFilter;