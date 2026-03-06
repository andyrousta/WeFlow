import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Search, Calendar, User, X, Loader2 } from 'lucide-react'
import { Avatar } from '../Avatar'
import JumpToDatePopover from '../JumpToDatePopover'

interface Contact {
    username: string
    displayName: string
    avatarUrl?: string
    postCount?: number
    postCountStatus?: 'idle' | 'loading' | 'ready'
}

interface ContactsCountProgress {
    resolved: number
    total: number
    running: boolean
}

interface SnsFilterPanelProps {
    searchKeyword: string
    setSearchKeyword: (val: string) => void
    jumpTargetDate?: Date
    setJumpTargetDate: (date?: Date) => void
    totalFriendsLabel?: string
    selectedUsernames: string[]
    setSelectedUsernames: (val: string[]) => void
    contacts: Contact[]
    contactSearch: string
    setContactSearch: (val: string) => void
    loading?: boolean
    contactsCountProgress?: ContactsCountProgress
}

export const SnsFilterPanel: React.FC<SnsFilterPanelProps> = ({
    searchKeyword,
    setSearchKeyword,
    jumpTargetDate,
    setJumpTargetDate,
    totalFriendsLabel,
    selectedUsernames,
    setSelectedUsernames,
    contacts,
    contactSearch,
    setContactSearch,
    loading,
    contactsCountProgress
}) => {
    const [showJumpPopover, setShowJumpPopover] = useState(false)
    const [jumpPopoverDate, setJumpPopoverDate] = useState<Date>(jumpTargetDate || new Date())
    const [jumpDateCounts, setJumpDateCounts] = useState<Record<string, number>>({})
    const [jumpDateMessageDates, setJumpDateMessageDates] = useState<Set<string>>(new Set())
    const [hasLoadedJumpDateCounts, setHasLoadedJumpDateCounts] = useState(false)
    const [loadingJumpDateCounts, setLoadingJumpDateCounts] = useState(false)
    const jumpCalendarWrapRef = useRef<HTMLDivElement | null>(null)
    const jumpDateCountsCacheRef = useRef<Map<string, Record<string, number>>>(new Map())
    const jumpDateRequestSeqRef = useRef(0)

    useEffect(() => {
        if (!showJumpPopover) return
        const handleClickOutside = (event: MouseEvent) => {
            if (!jumpCalendarWrapRef.current) return
            if (jumpCalendarWrapRef.current.contains(event.target as Node)) return
            setShowJumpPopover(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showJumpPopover])

    useEffect(() => {
        if (showJumpPopover) return
        setJumpPopoverDate(jumpTargetDate || new Date())
    }, [jumpTargetDate, showJumpPopover])

    const toMonthKey = useCallback((date: Date) => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }, [])

    const toDateKey = useCallback((timestampSeconds: number) => {
        const date = new Date(timestampSeconds * 1000)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }, [])

    const applyJumpDateCounts = useCallback((counts: Record<string, number>) => {
        setJumpDateCounts(counts)
        setJumpDateMessageDates(new Set(Object.keys(counts)))
        setHasLoadedJumpDateCounts(true)
    }, [])

    const loadJumpDateCounts = useCallback(async (monthDate: Date) => {
        const monthKey = toMonthKey(monthDate)
        const cached = jumpDateCountsCacheRef.current.get(monthKey)
        if (cached) {
            applyJumpDateCounts(cached)
            setLoadingJumpDateCounts(false)
            return
        }

        const requestSeq = ++jumpDateRequestSeqRef.current
        setLoadingJumpDateCounts(true)
        setHasLoadedJumpDateCounts(false)

        const year = monthDate.getFullYear()
        const month = monthDate.getMonth()
        const monthStart = new Date(year, month, 1, 0, 0, 0, 0)
        const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)
        const startTime = Math.floor(monthStart.getTime() / 1000)
        const endTime = Math.floor(monthEnd.getTime() / 1000)
        const pageSize = 200
        let offset = 0
        const counts: Record<string, number> = {}

        try {
            while (true) {
                const result = await window.electronAPI.sns.getTimeline(pageSize, offset, [], '', startTime, endTime)
                if (!result?.success || !Array.isArray(result.timeline) || result.timeline.length === 0) {
                    break
                }
                result.timeline.forEach((post) => {
                    const key = toDateKey(Number(post.createTime || 0))
                    if (!key) return
                    counts[key] = (counts[key] || 0) + 1
                })
                if (result.timeline.length < pageSize) break
                offset += pageSize
            }

            if (requestSeq !== jumpDateRequestSeqRef.current) return
            jumpDateCountsCacheRef.current.set(monthKey, counts)
            applyJumpDateCounts(counts)
        } catch (error) {
            console.error('加载朋友圈按日条数失败:', error)
            if (requestSeq !== jumpDateRequestSeqRef.current) return
            setJumpDateCounts({})
            setJumpDateMessageDates(new Set())
            setHasLoadedJumpDateCounts(true)
        } finally {
            if (requestSeq === jumpDateRequestSeqRef.current) {
                setLoadingJumpDateCounts(false)
            }
        }
    }, [applyJumpDateCounts, toDateKey, toMonthKey])

    const filteredContacts = contacts.filter(c =>
        (c.displayName || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
        c.username.toLowerCase().includes(contactSearch.toLowerCase())
    )

    const toggleUserSelection = (username: string) => {
        if (selectedUsernames.includes(username)) {
            setSelectedUsernames(selectedUsernames.filter(u => u !== username))
        } else {
            setJumpTargetDate(undefined) // Reset date jump when selecting user
            setSelectedUsernames([...selectedUsernames, username])
        }
    }

    const clearFilters = () => {
        setSearchKeyword('')
        setSelectedUsernames([])
        setJumpTargetDate(undefined)
    }

    const getEmptyStateText = () => {
        if (loading && contacts.length === 0) {
            return '正在加载联系人...'
        }
        if (contacts.length === 0) {
            return '暂无好友或曾经的好友'
        }
        return '没有找到联系人'
    }

    return (
        <aside className="sns-filter-panel">
            <div className="filter-header">
                <h3>筛选条件</h3>
                {(searchKeyword || jumpTargetDate || selectedUsernames.length > 0) && (
                    <button className="reset-all-btn" onClick={clearFilters} title="重置所有筛选">
                        <RefreshCw size={14} />
                    </button>
                )}
            </div>

            <div className="filter-widgets">
                {/* Search Widget */}
                <div className="filter-widget search-widget">
                    <div className="widget-header">
                        <Search size={14} />
                        <span>关键词搜索</span>
                    </div>
                    <div className="input-group">
                        <input
                            type="text"
                            placeholder="搜索动态内容..."
                            value={searchKeyword}
                            onChange={e => setSearchKeyword(e.target.value)}
                        />
                        {searchKeyword && (
                            <button className="clear-input-btn" onClick={() => setSearchKeyword('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Date Widget */}
                <div className="filter-widget date-widget">
                    <div className="date-widget-row">
                        <div className="widget-header">
                            <Calendar size={14} />
                            <span>时间跳转</span>
                        </div>
                        <div className="jump-calendar-anchor" ref={jumpCalendarWrapRef}>
                            <button
                                className={`date-picker-trigger ${jumpTargetDate ? 'active' : ''}`}
                                onClick={() => {
                                    if (!showJumpPopover) {
                                        const nextDate = jumpTargetDate || new Date()
                                        setJumpPopoverDate(nextDate)
                                        void loadJumpDateCounts(nextDate)
                                    }
                                    setShowJumpPopover(prev => !prev)
                                }}
                            >
                                <span className="date-text">
                                    {jumpTargetDate
                                        ? jumpTargetDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
                                        : '选择日期...'}
                                </span>
                                {jumpTargetDate && (
                                    <div
                                        className="clear-date-btn"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setJumpTargetDate(undefined)
                                        }}
                                    >
                                        <X size={12} />
                                    </div>
                                )}
                            </button>
                            <JumpToDatePopover
                                isOpen={showJumpPopover}
                                currentDate={jumpPopoverDate}
                                onClose={() => setShowJumpPopover(false)}
                                onMonthChange={(date) => {
                                    setJumpPopoverDate(date)
                                    void loadJumpDateCounts(date)
                                }}
                                onSelect={(date) => {
                                    setJumpPopoverDate(date)
                                    setJumpTargetDate(date)
                                }}
                                messageDates={jumpDateMessageDates}
                                hasLoadedMessageDates={hasLoadedJumpDateCounts}
                                messageDateCounts={jumpDateCounts}
                                loadingDateCounts={loadingJumpDateCounts}
                            />
                        </div>
                    </div>
                </div>

                {/* Contact Widget */}
                <div className="filter-widget contact-widget">
                    <div className="widget-header">
                        <User size={14} />
                        <span>联系人</span>
                        {selectedUsernames.length > 0 && (
                            <span className="badge">{selectedUsernames.length}</span>
                        )}
                        {totalFriendsLabel && (
                            <span className="widget-header-summary">{totalFriendsLabel}</span>
                        )}
                    </div>

                    <div className="contact-search-bar">
                        <input
                            type="text"
                            placeholder="查找好友..."
                            value={contactSearch}
                            onChange={e => setContactSearch(e.target.value)}
                        />
                        <Search size={14} className="search-icon" />
                        {contactSearch && (
                            <X size={14} className="clear-icon" onClick={() => setContactSearch('')} />
                        )}
                    </div>

                    {contactsCountProgress && contactsCountProgress.total > 0 && (
                        <div className="contact-count-progress">
                            {contactsCountProgress.running
                                ? `朋友圈条数统计中 ${contactsCountProgress.resolved}/${contactsCountProgress.total}`
                                : `朋友圈条数已统计 ${contactsCountProgress.total}/${contactsCountProgress.total}`}
                        </div>
                    )}

                    <div className="contact-list-scroll">
                        {filteredContacts.map(contact => {
                            const isPostCountReady = contact.postCountStatus === 'ready'
                            return (
                            <div
                                key={contact.username}
                                className={`contact-row ${selectedUsernames.includes(contact.username) ? 'selected' : ''}`}
                                onClick={() => toggleUserSelection(contact.username)}
                            >
                                <Avatar src={contact.avatarUrl} name={contact.displayName} size={36} shape="rounded" />
                                <div className="contact-meta">
                                    <span className="contact-name">{contact.displayName}</span>
                                </div>
                                <div className="contact-post-count-wrap">
                                    {isPostCountReady ? (
                                        <span className="contact-post-count">{Math.max(0, Math.floor(Number(contact.postCount || 0)))}条</span>
                                    ) : (
                                        <span className="contact-post-count-loading" title="统计中">
                                            <Loader2 size={13} className="spinning" />
                                        </span>
                                    )}
                                </div>
                            </div>
                            )
                        })}
                        {filteredContacts.length === 0 && (
                            <div className="empty-state">{getEmptyStateText()}</div>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    )
}

function RefreshCw({ size, className }: { size?: number, className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size || 24}
            height={size || 24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
    )
}
